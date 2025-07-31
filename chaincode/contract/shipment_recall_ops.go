package contract

import (
	"encoding/json"
	"errors"
	"fmt"
	"foodtrace/model"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// --- Lifecycle: Recall Operations ---

func (s *FoodtraceSmartContract) InitiateRecall(ctx contractapi.TransactionContextInterface, shipmentID, recallID, reason string) error {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("InitiateRecall: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)

	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return err
	}
	if err := s.validateRequiredString(recallID, "recallID", maxStringInputLength); err != nil {
		return err
	}
	if err := s.validateRequiredString(reason, "reason", maxRecallReasonLength); err != nil {
		return err
	}

	shipment, err := s.getShipmentByID(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("InitiateRecall: %w", err)
	}

	isCallerAdmin, _ := im.IsCurrentUserAdmin()
	if !isCallerAdmin && shipment.CurrentOwnerID != actor.fullID {
		ownerInfo, _ := im.GetIdentityInfo(shipment.CurrentOwnerID)
		ownerAlias := shipment.CurrentOwnerID
		if ownerInfo != nil {
			ownerAlias = ownerInfo.ShortName
		}
		return fmt.Errorf("unauthorized: only admin or current owner ('%s', alias '%s') can initiate recall for shipment '%s'", shipment.CurrentOwnerID, ownerAlias, shipmentID)
	}

	if shipment.RecallInfo.IsRecalled {
		if shipment.RecallInfo.RecallID == recallID {
			return fmt.Errorf("shipment '%s' is already part of this specific recall event '%s'", shipmentID, recallID)
		}
		logger.Warningf("Shipment '%s' was already recalled under recallID '%s'. This action will register an additional recall event '%s' or update details if applicable.", shipmentID, shipment.RecallInfo.RecallID, recallID)
	}

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("InitiateRecall: failed to get transaction timestamp: %w", err)
	}

	shipment.RecallInfo.IsRecalled = true
	shipment.RecallInfo.RecallID = recallID
	shipment.RecallInfo.RecallReason = reason
	shipment.RecallInfo.RecallDate = now
	shipment.RecallInfo.RecalledBy = actor.fullID
	shipment.RecallInfo.RecalledByAlias = actor.alias

	shipment.Status = model.StatusRecalled
	shipment.LastUpdatedAt = now
	ensureShipmentSchemaCompliance(shipment) // Ensure sub-fields are initialized

	shipmentKey, _ := s.createShipmentCompositeKey(ctx, shipmentID)
	updatedBytes, err := json.Marshal(shipment)
	if err != nil {
		return fmt.Errorf("InitiateRecall: failed to marshal recalled shipment '%s': %w", shipmentID, err)
	}
	if err := ctx.GetStub().PutState(shipmentKey, updatedBytes); err != nil {
		return fmt.Errorf("InitiateRecall: failed to save recalled shipment '%s' to ledger: %w", shipmentID, err)
	}

	s.emitShipmentEvent(ctx, "ShipmentRecalled", shipment, actor, map[string]interface{}{"recallId": recallID, "reason": reason})
	logger.Infof("Shipment '%s' recalled by '%s' (RecallID: %s)", shipmentID, actor.alias, recallID)
	return nil
}

func (s *FoodtraceSmartContract) AddLinkedShipmentsToRecall(ctx contractapi.TransactionContextInterface, primaryRecallID, primaryShipmentID string, linkedShipmentIDsJSON string) error {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("AddLinkedShipmentsToRecall: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)

	if err := s.validateRequiredString(primaryRecallID, "primaryRecallID", maxStringInputLength); err != nil {
		return err
	}
	if err := s.validateRequiredString(primaryShipmentID, "primaryShipmentID", maxStringInputLength); err != nil {
		return err
	}

	pShipment, err := s.getShipmentByID(ctx, primaryShipmentID)
	if err != nil {
		return fmt.Errorf("AddLinkedShipmentsToRecall: primary shipment '%s' not found: %w", primaryShipmentID, err)
	}

	if !pShipment.RecallInfo.IsRecalled || pShipment.RecallInfo.RecallID != primaryRecallID {
		return fmt.Errorf("primary shipment '%s' is not part of recall event '%s' or its RecallID does not match", primaryShipmentID, primaryRecallID)
	}

	isCallerAdmin, _ := im.IsCurrentUserAdmin()
	if !isCallerAdmin && pShipment.RecallInfo.RecalledBy != actor.fullID {
		return errors.New("unauthorized: only admin or the original initiator of the primary shipment's recall can link other shipments")
	}

	var linkedShipmentIDs []string
	if err := json.Unmarshal([]byte(linkedShipmentIDsJSON), &linkedShipmentIDs); err != nil {
		return fmt.Errorf("invalid linkedShipmentIDsJSON: %w", err)
	}
	if len(linkedShipmentIDs) == 0 {
		logger.Info("AddLinkedShipmentsToRecall: No linked shipment IDs provided to add.")
		return nil
	}
	if len(linkedShipmentIDs) > maxArrayElements {
		return fmt.Errorf("number of linked shipment IDs (%d) exceeds maximum of %d", len(linkedShipmentIDs), maxArrayElements)
	}

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("AddLinkedShipmentsToRecall: failed to get transaction timestamp: %w", err)
	}

	newlyLinkedCount := 0
	var actualNewlyLinkedIDsForPrimary []string

	for _, linkedID := range linkedShipmentIDs {
		if errVal := s.validateRequiredString(linkedID, "linkedShipmentID in array", maxStringInputLength); errVal != nil {
			logger.Warningf("AddLinkedShipmentsToRecall: Invalid linked shipment ID format '%s': %v. Skipping.", linkedID, errVal)
			continue
		}
		if linkedID == primaryShipmentID {
			logger.Infof("AddLinkedShipmentsToRecall: Cannot link primary shipment '%s' to itself. Skipping.", linkedID)
			continue
		}

		lShip, errGet := s.getShipmentByID(ctx, linkedID)
		if errGet != nil {
			logger.Warningf("AddLinkedShipmentsToRecall: Skipping linked shipment '%s': not found or error (%v)", linkedID, errGet)
			continue
		}

		if lShip.RecallInfo.IsRecalled && lShip.RecallInfo.RecallID == primaryRecallID {
			logger.Infof("AddLinkedShipmentsToRecall: Linked shipment '%s' already part of recall '%s'. Skipping.", linkedID, primaryRecallID)
			continue
		}
		if lShip.RecallInfo.IsRecalled && lShip.RecallInfo.RecallID != primaryRecallID {
			logger.Warningf("AddLinkedShipmentsToRecall: Linked shipment '%s' is already part of a different recall ('%s'). It will now also be linked to recall '%s'.", linkedID, lShip.RecallInfo.RecallID, primaryRecallID)
		}

		lShip.RecallInfo.IsRecalled = true
		lShip.RecallInfo.RecallID = primaryRecallID
		lShip.RecallInfo.RecallReason = pShipment.RecallInfo.RecallReason
		lShip.RecallInfo.RecallDate = now
		lShip.RecallInfo.RecalledBy = actor.fullID
		lShip.RecallInfo.RecalledByAlias = actor.alias
		lShip.Status = model.StatusRecalled
		lShip.LastUpdatedAt = now
		ensureShipmentSchemaCompliance(lShip) // Ensure sub-fields are initialized

		lShipKey, keyErr := s.createShipmentCompositeKey(ctx, linkedID)
		if keyErr != nil {
			logger.Warningf("AddLinkedShipmentsToRecall: Failed to create key for linked shipment '%s': %v. Skipping.", linkedID, keyErr)
			continue
		}
		lShipBytes, marshErr := json.Marshal(lShip)
		if marshErr != nil {
			logger.Warningf("AddLinkedShipmentsToRecall: Failed to marshal linked shipment '%s': %v. Skipping.", linkedID, marshErr)
			continue
		}
		if errPut := ctx.GetStub().PutState(lShipKey, lShipBytes); errPut != nil {
			logger.Warningf("AddLinkedShipmentsToRecall: Failed to save recalled linked shipment '%s': %v. Skipping.", linkedID, errPut)
			continue
		}
		s.emitShipmentEvent(ctx, "ShipmentRecalled", lShip, actor, map[string]interface{}{
			"recallId": primaryRecallID, "reason": lShip.RecallInfo.RecallReason,
			"linkedToPrimaryShipment": primaryShipmentID, "linkOperationBy": actor.fullID,
		})
		actualNewlyLinkedIDsForPrimary = append(actualNewlyLinkedIDsForPrimary, linkedID)
		newlyLinkedCount++
		logger.Infof("AddLinkedShipmentsToRecall: Linked shipment '%s' marked as recalled under event '%s'", linkedID, primaryRecallID)
	}

	if newlyLinkedCount > 0 {
		currentLinksOnPrimary := make(map[string]bool)
		for _, id := range pShipment.RecallInfo.LinkedShipmentIDs {
			currentLinksOnPrimary[id] = true
		}

		addedToPrimaryList := false
		for _, newLinkID := range actualNewlyLinkedIDsForPrimary {
			if !currentLinksOnPrimary[newLinkID] {
				pShipment.RecallInfo.LinkedShipmentIDs = append(pShipment.RecallInfo.LinkedShipmentIDs, newLinkID)
				addedToPrimaryList = true
			}
		}

		if addedToPrimaryList {
			pShipment.LastUpdatedAt = now
			pShipKey, _ := s.createShipmentCompositeKey(ctx, primaryShipmentID)
			pShipBytes, marshErr := json.Marshal(pShipment)
			if marshErr != nil {
				logger.Errorf("CRITICAL: AddLinkedShipmentsToRecall: Failed to marshal primary shipment '%s' after updating its linked IDs list: %v.", primaryShipmentID, marshErr)
			} else {
				if errPut := ctx.GetStub().PutState(pShipKey, pShipBytes); errPut != nil {
					logger.Errorf("CRITICAL: AddLinkedShipmentsToRecall: Failed to save primary shipment '%s' after updating its linked IDs list: %v.", primaryShipmentID, errPut)
				}
			}
		}
	}
	logger.Infof("AddLinkedShipmentsToRecall: Processed %d IDs; successfully linked %d new unique shipments to recall event '%s' for primary shipment '%s'", len(linkedShipmentIDs), newlyLinkedCount, primaryRecallID, primaryShipmentID)
	return nil
}
