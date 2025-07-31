package contract

import (
	"encoding/json"
	"errors"
	"fmt"
	"foodtrace/model"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// --- Lifecycle: Processor Operations ---

func (s *FoodtraceSmartContract) ProcessShipment(ctx contractapi.TransactionContextInterface, shipmentID string, processorDataJSON string) error {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("ProcessShipment: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)
	if err := im.RequireRole("processor"); err != nil {
		return err
	}

	logger.Infof("Processor '%s' (alias: '%s') processing shipment '%s'", actor.fullID, actor.alias, shipmentID)

	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return err
	}
	pdArgs, err := s.validateProcessorDataArgs(processorDataJSON)
	if err != nil {
		return err
	}

	shipment, err := s.getShipmentByID(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("ProcessShipment: %w", err)
	}

	if shipment.Status != model.StatusCreated && shipment.Status != model.StatusCertified {
		return fmt.Errorf("shipment '%s' cannot be processed. Current status: '%s'. Expected '%s' or '%s'",
			shipmentID, shipment.Status, model.StatusCreated, model.StatusCertified)
	}
	if shipment.RecallInfo.IsRecalled {
		return fmt.Errorf("recalled shipment '%s' cannot be processed", shipmentID)
	}

	if shipment.Status == model.StatusCreated {
		if shipment.FarmerData == nil || shipment.FarmerData.DestinationProcessorID == "" {
			return errors.New("ProcessShipment: shipment missing FarmerData or DestinationProcessorID; cannot verify processor designation")
		}
		if shipment.FarmerData.DestinationProcessorID != actor.fullID {
			targetInfo, _ := im.GetIdentityInfo(shipment.FarmerData.DestinationProcessorID)
			targetAlias := shipment.FarmerData.DestinationProcessorID
			if targetInfo != nil {
				targetAlias = targetInfo.ShortName
			}
			return fmt.Errorf("unauthorized: actor '%s' (alias: %s) is not the designated processor. Shipment intended for '%s' (alias: %s)",
				actor.fullID, actor.alias, shipment.FarmerData.DestinationProcessorID, targetAlias)
		}
	}

	destDistFullID, err := im.ResolveIdentity(pdArgs.DestinationDistributorID)
	if err != nil {
		return fmt.Errorf("ProcessShipment: failed to resolve processorData.destinationDistributorId '%s': %w", pdArgs.DestinationDistributorID, err)
	}

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("ProcessShipment: failed to get transaction timestamp: %w", err)
	}

	shipment.ProcessorData = &model.ProcessorData{
		ProcessorID:              actor.fullID,
		ProcessorAlias:           actor.alias,
		DateProcessed:            pdArgs.DateProcessed,
		ProcessingType:           pdArgs.ProcessingType,
		ProcessingLineID:         pdArgs.ProcessingLineID,
		ProcessingLocation:       pdArgs.ProcessingLocation,
		ProcessingCoordinates:    pdArgs.ProcessingCoordinates,
		ContaminationCheck:       pdArgs.ContaminationCheck,
		OutputBatchID:            pdArgs.OutputBatchID,
		ExpiryDate:               pdArgs.ExpiryDate,
		QualityCertifications:    pdArgs.QualityCertifications,
		DestinationDistributorID: destDistFullID,
	}
	shipment.Status = model.StatusProcessed
	shipment.CurrentOwnerID = actor.fullID
	shipment.CurrentOwnerAlias = actor.alias
	shipment.LastUpdatedAt = now
	ensureShipmentSchemaCompliance(shipment) // Ensure sub-fields are initialized

	shipmentKey, _ := s.createShipmentCompositeKey(ctx, shipmentID)
	shipmentBytes, err := json.Marshal(shipment)
	if err != nil {
		return fmt.Errorf("ProcessShipment: failed to marshal shipment '%s': %w", shipmentID, err)
	}
	if err := ctx.GetStub().PutState(shipmentKey, shipmentBytes); err != nil {
		return fmt.Errorf("ProcessShipment: failed to update shipment '%s' on ledger: %w", shipmentID, err)
	}

	eventPayload := map[string]interface{}{
		"destinationDistributorFullId": destDistFullID, "processingType": pdArgs.ProcessingType,
		"dateProcessed": pdArgs.DateProcessed.Format(time.RFC3339), "contaminationCheck": pdArgs.ContaminationCheck,
	}
	s.emitShipmentEvent(ctx, "ShipmentProcessed", shipment, actor, eventPayload)
	logger.Infof("Shipment '%s' processed by '%s'", shipmentID, actor.alias)
	return nil
}

func (s *FoodtraceSmartContract) TransformAndCreateProducts(ctx contractapi.TransactionContextInterface,
	inputShipmentConsumptionJSON string,
	newProductsDataJSON string,
	processorDataJSON string) error {

	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("TransformAndCreateProducts: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)
	if err := im.RequireRole("processor"); err != nil {
		return fmt.Errorf("TransformAndCreateProducts: %w", err)
	}

	logger.Infof("Processor '%s' (alias: '%s') initiating transformation process (full consumption).", actor.fullID, actor.alias)

	var inputConsumptionDetails []model.InputShipmentConsumptionDetail
	if err := json.Unmarshal([]byte(inputShipmentConsumptionJSON), &inputConsumptionDetails); err != nil {
		return fmt.Errorf("TransformAndCreateProducts: invalid inputShipmentConsumptionJSON: %w", err)
	}
	if len(inputConsumptionDetails) == 0 {
		return errors.New("TransformAndCreateProducts: at least one input shipment must be specified for consumption")
	}

	var newProductDetails []model.NewProductDetail
	if err := json.Unmarshal([]byte(newProductsDataJSON), &newProductDetails); err != nil {
		return fmt.Errorf("TransformAndCreateProducts: invalid newProductsDataJSON: %w", err)
	}
	if len(newProductDetails) == 0 {
		return errors.New("TransformAndCreateProducts: at least one new product must be specified for creation")
	}

	transformationProcessorDataArgs, err := s.validateProcessorDataArgs(processorDataJSON)
	if err != nil {
		return fmt.Errorf("TransformAndCreateProducts: invalid processorDataJSON for transformation event: %w", err)
	}
	resolvedTransformationDestDistributorID := ""
	if transformationProcessorDataArgs.DestinationDistributorID != "" {
		resolvedTransformationDestDistributorID, err = im.ResolveIdentity(transformationProcessorDataArgs.DestinationDistributorID)
		if err != nil {
			return fmt.Errorf("TransformAndCreateProducts: failed to resolve DestinationDistributorID '%s' from processorDataJSON: %w", transformationProcessorDataArgs.DestinationDistributorID, err)
		}
	}

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("TransformAndCreateProducts: failed to get transaction timestamp: %w", err)
	}

	var consumedInputShipmentIDs []string
	logger.Infof("TransformAndCreateProducts: Processing %d input shipments for full consumption.", len(inputConsumptionDetails))
	for i, inputDetail := range inputConsumptionDetails {
		fieldNamePrefix := fmt.Sprintf("inputConsumptionDetails[%d]", i)
		if errVal := s.validateRequiredString(inputDetail.ShipmentID, fieldNamePrefix+".ShipmentID", maxStringInputLength); errVal != nil {
			return fmt.Errorf("TransformAndCreateProducts: %w", errVal)
		}

		inputShipment, errGet := s.getShipmentByID(ctx, inputDetail.ShipmentID)
		if errGet != nil {
			return fmt.Errorf("TransformAndCreateProducts: failed to get input shipment '%s': %w", inputDetail.ShipmentID, errGet)
		}

		if inputShipment.CurrentOwnerID != actor.fullID {
			logger.Infof("TransformAndCreateProducts: transferring ownership of input shipment '%s' from '%s' to processor '%s'",
				inputDetail.ShipmentID, inputShipment.CurrentOwnerAlias, actor.alias)
			inputShipment.CurrentOwnerID = actor.fullID
			inputShipment.CurrentOwnerAlias = actor.alias
		}
		validConsumableStatuses := map[model.ShipmentStatus]bool{
			model.StatusDelivered: true, model.StatusProcessed: true, model.StatusCertified: true,
		}
		if !validConsumableStatuses[inputShipment.Status] {
			return fmt.Errorf("TransformAndCreateProducts: input shipment '%s' is not in a consumable state (current: %s). Expected one of: DELIVERED, PROCESSED, CERTIFIED", inputDetail.ShipmentID, inputShipment.Status)
		}
		if inputShipment.RecallInfo.IsRecalled {
			return fmt.Errorf("TransformAndCreateProducts: input shipment '%s' is recalled and cannot be consumed", inputDetail.ShipmentID)
		}
		if inputShipment.IsArchived {
			return fmt.Errorf("TransformAndCreateProducts: input shipment '%s' is archived and cannot be consumed", inputDetail.ShipmentID)
		}
		if inputShipment.Status == model.StatusConsumedInProcessing {
			return fmt.Errorf("TransformAndCreateProducts: input shipment '%s' has already been consumed in processing", inputDetail.ShipmentID)
		}

		inputShipment.Status = model.StatusConsumedInProcessing
		inputShipment.Quantity = 0
		inputShipment.LastUpdatedAt = now

		inputShipmentKey, _ := s.createShipmentCompositeKey(ctx, inputDetail.ShipmentID)
		inputShipmentBytes, errMarshal := json.Marshal(inputShipment)
		if errMarshal != nil {
			return fmt.Errorf("TransformAndCreateProducts: failed to marshal updated input shipment '%s': %w", inputDetail.ShipmentID, errMarshal)
		}
		if errPut := ctx.GetStub().PutState(inputShipmentKey, inputShipmentBytes); errPut != nil {
			return fmt.Errorf("TransformAndCreateProducts: failed to save updated input shipment '%s': %w", inputDetail.ShipmentID, errPut)
		}

		s.emitShipmentEvent(ctx, "InputShipmentConsumedInTransformation", inputShipment, actor, map[string]interface{}{
			"transformationEventOutputBatchID": transformationProcessorDataArgs.OutputBatchID,
			"consumedQuantity":                 "FULL",
		})
		consumedInputShipmentIDs = append(consumedInputShipmentIDs, inputDetail.ShipmentID)
		logger.Infof("TransformAndCreateProducts: Input shipment '%s' marked as '%s' (fully consumed).", inputDetail.ShipmentID, model.StatusConsumedInProcessing)
	}

	logger.Infof("TransformAndCreateProducts: Creating %d new output product shipments.", len(newProductDetails))
	for i, newProdDetail := range newProductDetails {
		fieldNamePrefix := fmt.Sprintf("newProductDetails[%d]", i)
		if errVal := s.validateRequiredString(newProdDetail.NewShipmentID, fieldNamePrefix+".NewShipmentID", maxStringInputLength); errVal != nil {
			return fmt.Errorf("TransformAndCreateProducts: %w", errVal)
		}
		if errVal := s.validateRequiredString(newProdDetail.ProductName, fieldNamePrefix+".ProductName", maxStringInputLength); errVal != nil {
			return fmt.Errorf("TransformAndCreateProducts: %w", errVal)
		}
		if errVal := s.validateOptionalString(newProdDetail.Description, fieldNamePrefix+".Description", maxDescriptionLength); errVal != nil {
			return fmt.Errorf("TransformAndCreateProducts: %w", errVal)
		}
		if newProdDetail.Quantity <= 0 {
			return fmt.Errorf("TransformAndCreateProducts: %s.Quantity must be positive, got %f", fieldNamePrefix, newProdDetail.Quantity)
		}
		if errVal := s.validateRequiredString(newProdDetail.UnitOfMeasure, fieldNamePrefix+".UnitOfMeasure", maxStringInputLength); errVal != nil {
			return fmt.Errorf("TransformAndCreateProducts: %w", errVal)
		}

		newShipmentKey, errKey := s.createShipmentCompositeKey(ctx, newProdDetail.NewShipmentID)
		if errKey != nil {
			return fmt.Errorf("TransformAndCreateProducts: failed to create composite key for new product shipment '%s': %w", newProdDetail.NewShipmentID, errKey)
		}
		existingNewShipment, errGetExisting := ctx.GetStub().GetState(newShipmentKey)
		if errGetExisting != nil {
			return fmt.Errorf("TransformAndCreateProducts: failed to check for existing new product shipment '%s': %w", newProdDetail.NewShipmentID, errGetExisting)
		}
		if existingNewShipment != nil {
			return fmt.Errorf("TransformAndCreateProducts: new product shipment with ID '%s' already exists", newProdDetail.NewShipmentID)
		}

		outputShipment := model.Shipment{
			ObjectType:        shipmentObjectType,
			ID:                newProdDetail.NewShipmentID,
			ProductName:       newProdDetail.ProductName,
			Description:       newProdDetail.Description,
			Quantity:          newProdDetail.Quantity,
			UnitOfMeasure:     newProdDetail.UnitOfMeasure,
			CurrentOwnerID:    actor.fullID,
			CurrentOwnerAlias: actor.alias,
			Status:            model.StatusProcessed,
			CreatedAt:         now,
			LastUpdatedAt:     now,
			IsArchived:        false,
			InputShipmentIDs:  consumedInputShipmentIDs,
			IsDerivedProduct:  true,
			ProcessorData: &model.ProcessorData{
				ProcessorID:              actor.fullID,
				ProcessorAlias:           actor.alias,
				DateProcessed:            transformationProcessorDataArgs.DateProcessed,
				ProcessingType:           transformationProcessorDataArgs.ProcessingType,
				ProcessingLineID:         transformationProcessorDataArgs.ProcessingLineID,
				ProcessingLocation:       transformationProcessorDataArgs.ProcessingLocation,
				ProcessingCoordinates:    transformationProcessorDataArgs.ProcessingCoordinates,
				ContaminationCheck:       transformationProcessorDataArgs.ContaminationCheck,
				OutputBatchID:            transformationProcessorDataArgs.OutputBatchID,
				ExpiryDate:               transformationProcessorDataArgs.ExpiryDate,
				QualityCertifications:    transformationProcessorDataArgs.QualityCertifications,
				DestinationDistributorID: resolvedTransformationDestDistributorID,
			},
			FarmerData:           &model.FarmerData{},
			CertificationRecords: []model.CertificationRecord{},
			DistributorData:      &model.DistributorData{},
			RetailerData:         &model.RetailerData{},
			RecallInfo:           &model.RecallInfo{IsRecalled: false, LinkedShipmentIDs: []string{}},
			History:              []model.HistoryEntry{},
		}
		ensureShipmentSchemaCompliance(&outputShipment)

		outputShipmentBytes, errMarshal := json.Marshal(outputShipment)
		if errMarshal != nil {
			return fmt.Errorf("TransformAndCreateProducts: failed to marshal new output shipment '%s': %w", newProdDetail.NewShipmentID, errMarshal)
		}
		if errPut := ctx.GetStub().PutState(newShipmentKey, outputShipmentBytes); errPut != nil {
			return fmt.Errorf("TransformAndCreateProducts: failed to save new output shipment '%s': %w", newProdDetail.NewShipmentID, errPut)
		}

		s.emitShipmentEvent(ctx, "DerivedProductCreated", &outputShipment, actor, map[string]interface{}{
			"transformationEventOutputBatchID": transformationProcessorDataArgs.OutputBatchID,
			"inputShipmentIDs":                 consumedInputShipmentIDs,
		})
		logger.Infof("TransformAndCreateProducts: New output product '%s' (ID: '%s') created.", newProdDetail.ProductName, newProdDetail.NewShipmentID)
	}

	logger.Infof("TransformAndCreateProducts: Transformation process completed successfully by processor '%s'. %d inputs consumed, %d new products created.",
		actor.alias, len(inputConsumptionDetails), len(newProductDetails))
	return nil
}
