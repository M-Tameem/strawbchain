package contract

import (
	"encoding/json"
	"errors"
	"fmt"
	"foodtrace/model"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// --- Lifecycle: Farmer Operations ---

func (s *FoodtraceSmartContract) CreateShipment(ctx contractapi.TransactionContextInterface,
	shipmentID string, productName string, description string, quantity float64, unitOfMeasure string,
	farmerDataJSON string) error {

	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("CreateShipment: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)
	if err := im.RequireRole("farmer"); err != nil {
		return err
	}

	logger.Infof("Farmer '%s' (alias: '%s') creating shipment '%s': %s", actor.fullID, actor.alias, shipmentID, productName)

	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return err
	}
	if err := s.validateRequiredString(productName, "productName", maxStringInputLength); err != nil {
		return err
	}
	if err := s.validateOptionalString(description, "description", maxDescriptionLength); err != nil {
		return err
	}
	if quantity <= 0 {
		return errors.New("quantity must be positive")
	}
	if err := s.validateRequiredString(unitOfMeasure, "unitOfMeasure", maxStringInputLength); err != nil {
		return err
	}

	shipmentKey, err := s.createShipmentCompositeKey(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("CreateShipment: failed to create composite key for shipment '%s': %w", shipmentID, err)
	}
	existing, err := ctx.GetStub().GetState(shipmentKey)
	if err != nil {
		return fmt.Errorf("CreateShipment: failed to check for existing shipment '%s': %w", shipmentID, err)
	}
	if existing != nil {
		return fmt.Errorf("shipment with ID '%s' already exists", shipmentID)
	}

	fdArgs, err := s.validateFarmerDataArgs(ctx, farmerDataJSON) // Using dedicated validator
	if err != nil {
		return fmt.Errorf("CreateShipment: invalid farmerDataJSON: %w", err)
	}

	destProcFullID, err := im.ResolveIdentity(fdArgs.DestinationProcessorID)
	if err != nil {
		return fmt.Errorf("CreateShipment: failed to resolve destinationProcessorId '%s': %w", fdArgs.DestinationProcessorID, err)
	}
	// Optional: Stronger check for DestinationProcessor's role
	// hasRole, roleErr := im.HasRole(destProcFullID, "processor")
	// if roleErr != nil { return fmt.Errorf("CreateShipment: error checking role for destination processor '%s': %w", destProcFullID, roleErr) }
	// if !hasRole { return fmt.Errorf("CreateShipment: destination identity '%s' (alias: %s) does not have 'processor' role", destProcFullID, fdArgs.DestinationProcessorID) }

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("CreateShipment: failed to get transaction timestamp: %w", err)
	}

	shipment := model.Shipment{
		ObjectType: shipmentObjectType, ID: shipmentID, ProductName: productName, Description: description,
		Quantity: quantity, UnitOfMeasure: unitOfMeasure, CurrentOwnerID: actor.fullID, CurrentOwnerAlias: actor.alias,
		Status: model.StatusCreated, CreatedAt: now, LastUpdatedAt: now,
		FarmerData: &model.FarmerData{ // Directly use validated and parsed fdArgs
			FarmerID:                  actor.fullID,
			FarmerAlias:               actor.alias,
			FarmerName:                fdArgs.FarmerName,
			FarmLocation:              fdArgs.FarmLocation,
			FarmCoordinates:           fdArgs.FarmCoordinates,
			CropType:                  fdArgs.CropType,
			PlantingDate:              fdArgs.PlantingDate,
			FertilizerUsed:            fdArgs.FertilizerUsed,
			CertificationDocumentHash: fdArgs.CertificationDocumentHash,
			HarvestDate:               fdArgs.HarvestDate,
			FarmingPractice:           fdArgs.FarmingPractice,
			BedType:                   fdArgs.BedType,
			IrrigationMethod:          fdArgs.IrrigationMethod,
			OrganicSince:              fdArgs.OrganicSince,
			BufferZoneMeters:          fdArgs.BufferZoneMeters,
			DestinationProcessorID:    destProcFullID,
		},
		CertificationRecords: []model.CertificationRecord{},
		RecallInfo:           &model.RecallInfo{IsRecalled: false, LinkedShipmentIDs: []string{}},
		History:              []model.HistoryEntry{},
	}
	ensureShipmentSchemaCompliance(&shipment) // Call before marshal

	shipmentBytes, err := json.Marshal(shipment)
	if err != nil {
		return fmt.Errorf("CreateShipment: failed to marshal shipment '%s': %w", shipmentID, err)
	}
	if err := ctx.GetStub().PutState(shipmentKey, shipmentBytes); err != nil {
		return fmt.Errorf("CreateShipment: failed to save shipment '%s' to ledger: %w", shipmentID, err)
	}

	eventPayload := map[string]interface{}{
		"destinationProcessorFullId": destProcFullID, "cropType": fdArgs.CropType, "harvestDate": fdArgs.HarvestDate.Format(time.RFC3339),
		"plantingDate": fdArgs.PlantingDate.Format(time.RFC3339), "farmingPractice": fdArgs.FarmingPractice,
	}
	s.emitShipmentEvent(ctx, "ShipmentCreated", &shipment, actor, eventPayload)
	logger.Infof("Shipment '%s' created successfully by farmer '%s'", shipmentID, actor.alias)
	return nil
}
