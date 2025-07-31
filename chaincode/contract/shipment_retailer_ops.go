package contract

import (
	"encoding/json"
	"fmt"
	"foodtrace/model"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// --- Lifecycle: Retailer Operations ---

func (s *FoodtraceSmartContract) ReceiveShipment(ctx contractapi.TransactionContextInterface, shipmentID string, retailerDataJSON string) error {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("ReceiveShipment: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)
	if err := im.RequireRole("retailer"); err != nil {
		return err
	}

	logger.Infof("Retailer '%s' (alias: '%s') receiving shipment '%s'", actor.fullID, actor.alias, shipmentID)

	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return err
	}
	rdArgs, err := s.validateRetailerDataArgs(retailerDataJSON)
	if err != nil {
		return err
	}

	shipment, err := s.getShipmentAndVerifyStage(ctx, shipmentID, model.StatusDistributed, actor.fullID)
	if err != nil {
		return fmt.Errorf("ReceiveShipment: %w", err)
	}

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("ReceiveShipment: failed to get transaction timestamp: %w", err)
	}

	shipment.RetailerData = &model.RetailerData{
		RetailerID:         actor.fullID,
		RetailerAlias:      actor.alias,
		DateReceived:       rdArgs.DateReceived,
		RetailerLineID:     rdArgs.RetailerLineID,
		ProductNameRetail:  rdArgs.ProductNameRetail,
		ShelfLife:          rdArgs.ShelfLife,
		SellByDate:         rdArgs.SellByDate,
		RetailerExpiryDate: rdArgs.RetailerExpiryDate,
		StoreID:            rdArgs.StoreID,
		StoreLocation:      rdArgs.StoreLocation,
		StoreCoordinates:   rdArgs.StoreCoordinates,
		Price:              rdArgs.Price,
		QRCodeLink:         rdArgs.QRCodeLink,
	}
	shipment.Status = model.StatusDelivered
	shipment.CurrentOwnerID = actor.fullID
	shipment.CurrentOwnerAlias = actor.alias
	shipment.LastUpdatedAt = now
	ensureShipmentSchemaCompliance(shipment) // Ensure sub-fields are initialized

	shipmentKey, _ := s.createShipmentCompositeKey(ctx, shipmentID)
	shipmentBytes, err := json.Marshal(shipment)
	if err != nil {
		return fmt.Errorf("ReceiveShipment: failed to marshal shipment '%s': %w", shipmentID, err)
	}
	if err := ctx.GetStub().PutState(shipmentKey, shipmentBytes); err != nil {
		return fmt.Errorf("ReceiveShipment: failed to update shipment '%s' on ledger: %w", shipmentID, err)
	}

	eventPayload := map[string]interface{}{
		"storeId": rdArgs.StoreID, "storeLocation": rdArgs.StoreLocation, "dateReceived": rdArgs.DateReceived.Format(time.RFC3339),
	}
	if rdArgs.Price != 0 { // Send price if set explicitly (original logic)
		eventPayload["price"] = rdArgs.Price
	}
	s.emitShipmentEvent(ctx, "ShipmentDelivered", shipment, actor, eventPayload)
	logger.Infof("Shipment '%s' received by '%s'", shipmentID, actor.alias)
	return nil
}
