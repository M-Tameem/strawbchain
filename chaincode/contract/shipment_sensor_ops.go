// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

package contract

import (
	"encoding/json"
	"fmt"
	"foodtrace/model"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// AddDistributorSensorLog appends an immutable sensor reading for a shipment.
func (s *FoodtraceSmartContract) AddDistributorSensorLog(ctx contractapi.TransactionContextInterface, shipmentID string, logJSON string) error {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("AddDistributorSensorLog: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)
	if err := im.RequireRole("distributor"); err != nil {
		return err
	}
	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return err
	}

	var input struct {
		Temperature float64        `json:"temperature"`
		Humidity    float64        `json:"humidity"`
		Coordinates model.GeoPoint `json:"coordinates"`
		Timestamp   string         `json:"timestamp"`
	}
	if err := json.Unmarshal([]byte(logJSON), &input); err != nil {
		return fmt.Errorf("AddDistributorSensorLog: unmarshal log: %w", err)
	}
	if err := s.validateGeoPoint(&input.Coordinates, "coordinates", true); err != nil {
		return err
	}
	ts, err := parseDateString(input.Timestamp, "timestamp", false)
	if err != nil {
		return err
	}
	if ts.IsZero() {
		ts, err = s.getCurrentTxTimestamp(ctx)
		if err != nil {
			return fmt.Errorf("AddDistributorSensorLog: failed to get tx timestamp: %w", err)
		}
	}

	shipment, err := s.getShipmentByID(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("AddDistributorSensorLog: %w", err)
	}

	var designated string
	switch shipment.Status {
	case model.StatusProcessed:
		if shipment.ProcessorData == nil {
			return fmt.Errorf("AddDistributorSensorLog: missing ProcessorData for shipment '%s'", shipmentID)
		}
		designated = shipment.ProcessorData.DestinationDistributorID
	case model.StatusDistributed:
		if shipment.DistributorData == nil {
			return fmt.Errorf("AddDistributorSensorLog: missing DistributorData for shipment '%s'", shipmentID)
		}
		designated = shipment.DistributorData.DistributorID
	default:
		return fmt.Errorf("AddDistributorSensorLog: shipment '%s' status '%s' does not accept sensor logs", shipmentID, shipment.Status)
	}
	resolvedDesignated, err := im.ResolveIdentity(designated)
	if err != nil {
		return fmt.Errorf("AddDistributorSensorLog: failed to resolve designated distributor '%s': %w", designated, err)
	}
	resolvedActor, err := im.ResolveIdentity(actor.fullID)
	if err != nil {
		return fmt.Errorf("AddDistributorSensorLog: failed to resolve actor '%s': %w", actor.fullID, err)
	}
	if resolvedDesignated != resolvedActor {
		return fmt.Errorf("AddDistributorSensorLog: distributor '%s' not authorized for shipment '%s'", actor.alias, shipmentID)
	}

	if shipment.DistributorData == nil {
		shipment.DistributorData = &model.DistributorData{}
	}
	reading := model.ColdChainLog{
		Timestamp:   ts,
		Temperature: input.Temperature,
		Humidity:    input.Humidity,
		Coordinates: input.Coordinates,
	}
	shipment.DistributorData.SensorLogs = append(shipment.DistributorData.SensorLogs, reading)

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("AddDistributorSensorLog: failed to get tx timestamp: %w", err)
	}
	shipment.LastUpdatedAt = now
	ensureShipmentSchemaCompliance(shipment)

	shipmentKey, _ := s.createShipmentCompositeKey(ctx, shipmentID)
	shipmentBytes, err := json.Marshal(shipment)
	if err != nil {
		return fmt.Errorf("AddDistributorSensorLog: marshal shipment '%s': %w", shipmentID, err)
	}
	if err := ctx.GetStub().PutState(shipmentKey, shipmentBytes); err != nil {
		return fmt.Errorf("AddDistributorSensorLog: update shipment '%s': %w", shipmentID, err)
	}
	s.emitShipmentEvent(ctx, "DistributorSensorLogAdded", shipment, actor, map[string]interface{}{"timestamp": ts.Format(time.RFC3339)})
	return nil
}

// GetDistributorSensorLogs retrieves all sensor readings for a shipment.
func (s *FoodtraceSmartContract) GetDistributorSensorLogs(ctx contractapi.TransactionContextInterface, shipmentID string) ([]model.ColdChainLog, error) {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("GetDistributorSensorLogs: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)
	if err := im.RequireRole("distributor"); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return nil, err
	}
	shipment, err := s.getShipmentByID(ctx, shipmentID)
	if err != nil {
		return nil, fmt.Errorf("GetDistributorSensorLogs: %w", err)
	}
	var designated string
	switch shipment.Status {
	case model.StatusProcessed:
		if shipment.ProcessorData == nil {
			return nil, fmt.Errorf("GetDistributorSensorLogs: missing ProcessorData for shipment '%s'", shipmentID)
		}
		designated = shipment.ProcessorData.DestinationDistributorID
	case model.StatusDistributed:
		if shipment.DistributorData == nil {
			return nil, fmt.Errorf("GetDistributorSensorLogs: missing DistributorData for shipment '%s'", shipmentID)
		}
		designated = shipment.DistributorData.DistributorID
	default:
		return nil, fmt.Errorf("GetDistributorSensorLogs: shipment '%s' status '%s' does not have sensor logs", shipmentID, shipment.Status)
	}
	resolvedDesignated, err := im.ResolveIdentity(designated)
	if err != nil {
		return nil, fmt.Errorf("GetDistributorSensorLogs: failed to resolve designated distributor '%s': %w", designated, err)
	}
	resolvedActor, err := im.ResolveIdentity(actor.fullID)
	if err != nil {
		return nil, fmt.Errorf("GetDistributorSensorLogs: failed to resolve actor '%s': %w", actor.fullID, err)
	}
	if resolvedDesignated != resolvedActor {
		return nil, fmt.Errorf("GetDistributorSensorLogs: distributor '%s' not authorized for shipment '%s'", actor.alias, shipmentID)
	}

	if shipment.DistributorData == nil || shipment.DistributorData.SensorLogs == nil {
		return []model.ColdChainLog{}, nil
	}
	return shipment.DistributorData.SensorLogs, nil
}
