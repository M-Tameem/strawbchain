package contract

import (
	"encoding/json"
	"fmt"
	"foodtrace/model"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// --- Lifecycle: Distributor Operations ---

func (s *FoodtraceSmartContract) DistributeShipment(ctx contractapi.TransactionContextInterface, shipmentID string, distributorDataJSON string) error {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("DistributeShipment: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)
	if err := im.RequireRole("distributor"); err != nil {
		return err
	}

	logger.Infof("Distributor '%s' (alias: '%s') distributing shipment '%s'", actor.fullID, actor.alias, shipmentID)

	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return err
	}
	ddArgs, err := s.validateDistributorDataArgs(distributorDataJSON)
	if err != nil {
		return err
	}

	shipment, err := s.getShipmentAndVerifyStage(ctx, shipmentID, model.StatusProcessed, actor.fullID)
	if err != nil {
		return fmt.Errorf("DistributeShipment: %w", err)
	}

	destRetFullID, err := im.ResolveIdentity(ddArgs.DestinationRetailerID)
	if err != nil {
		return fmt.Errorf("DistributeShipment: failed to resolve distributorData.destinationRetailerId '%s': %w", ddArgs.DestinationRetailerID, err)
	}

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("DistributeShipment: failed to get transaction timestamp: %w", err)
	}

	shipment.DistributorData = &model.DistributorData{
		DistributorID:         actor.fullID,
		DistributorAlias:      actor.alias,
		PickupDateTime:        ddArgs.PickupDateTime,
		DeliveryDateTime:      ddArgs.DeliveryDateTime,
		DistributionLineID:    ddArgs.DistributionLineID,
		TemperatureRange:      ddArgs.TemperatureRange,
		StorageTemperature:    ddArgs.StorageTemperature,
		TransitLocationLog:    ddArgs.TransitLocationLog,
		TransitGPSLog:         ddArgs.TransitGPSLog,
		TransportConditions:   ddArgs.TransportConditions,
		DistributionCenter:    ddArgs.DistributionCenter,
		DestinationRetailerID: destRetFullID,
	}
	shipment.Status = model.StatusDistributed
	shipment.CurrentOwnerID = actor.fullID
	shipment.CurrentOwnerAlias = actor.alias
	shipment.LastUpdatedAt = now
	ensureShipmentSchemaCompliance(shipment) // Ensure sub-fields are initialized

	shipmentKey, _ := s.createShipmentCompositeKey(ctx, shipmentID)
	shipmentBytes, err := json.Marshal(shipment)
	if err != nil {
		return fmt.Errorf("DistributeShipment: failed to marshal shipment '%s': %w", shipmentID, err)
	}
	if err := ctx.GetStub().PutState(shipmentKey, shipmentBytes); err != nil {
		return fmt.Errorf("DistributeShipment: failed to update shipment '%s' on ledger: %w", shipmentID, err)
	}

	eventPayload := map[string]interface{}{
		"destinationRetailerFullId": destRetFullID, "pickupDateTime": ddArgs.PickupDateTime.Format(time.RFC3339),
		"distributionCenter": ddArgs.DistributionCenter,
	}
	if !ddArgs.DeliveryDateTime.IsZero() {
		eventPayload["deliveryDateTime"] = ddArgs.DeliveryDateTime.Format(time.RFC3339)
	}
	s.emitShipmentEvent(ctx, "ShipmentDistributed", shipment, actor, eventPayload)
	logger.Infof("Shipment '%s' distributed by '%s'", shipmentID, actor.alias)
	return nil
}
