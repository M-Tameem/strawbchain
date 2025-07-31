package contract

import (
	"encoding/json"
	"fmt"
	"foodtrace/model"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// --- Lifecycle: Certifier Operations ---

func (s *FoodtraceSmartContract) SubmitForCertification(ctx contractapi.TransactionContextInterface, shipmentID string) error {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("SubmitForCertification: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)

	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return err
	}
	shipment, err := s.getShipmentByID(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("SubmitForCertification: %w", err)
	}

	isCallerAdmin, _ := im.IsCurrentUserAdmin()
	if !isCallerAdmin && shipment.CurrentOwnerID != actor.fullID {
		return fmt.Errorf("unauthorized: only current owner ('%s', alias '%s') or admin can submit shipment '%s' for certification", shipment.CurrentOwnerAlias, shipment.CurrentOwnerID, shipmentID)
	}

	if shipment.Status == model.StatusPendingCertification {
		return fmt.Errorf("shipment '%s' is already pending certification", shipmentID)
	}
	if shipment.Status == model.StatusCertified || shipment.Status == model.StatusCertificationRejected {
		return fmt.Errorf("shipment '%s' has already been through a certification decision (Status: %s). Further actions may require a different process.", shipmentID, shipment.Status)
	}
	if shipment.RecallInfo.IsRecalled {
		return fmt.Errorf("recalled shipment '%s' cannot be submitted for certification", shipmentID)
	}
	if shipment.Status == model.StatusDistributed || shipment.Status == model.StatusDelivered || shipment.Status == model.StatusConsumed {
		return fmt.Errorf("shipment '%s' is too far in the supply chain (Status: %s) to be submitted for certification", shipmentID, shipment.Status)
	}
	if shipment.Status != model.StatusCreated && shipment.Status != model.StatusProcessed {
		logger.Warningf("Shipment '%s' is being submitted for certification from an unusual prior status: %s. Allowed.", shipmentID, shipment.Status)
	}

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("SubmitForCertification: failed to get transaction timestamp: %w", err)
	}

	shipment.Status = model.StatusPendingCertification
	shipment.LastUpdatedAt = now

	shipmentKey, _ := s.createShipmentCompositeKey(ctx, shipmentID)
	shipmentBytes, err := json.Marshal(shipment)
	if err != nil {
		return fmt.Errorf("SubmitForCertification: failed to marshal shipment '%s': %w", shipmentID, err)
	}
	if err := ctx.GetStub().PutState(shipmentKey, shipmentBytes); err != nil {
		return fmt.Errorf("SubmitForCertification: failed to update shipment '%s' status to PendingCertification: %w", shipmentID, err)
	}

	s.emitShipmentEvent(ctx, "ShipmentSubmittedForCertification", shipment, actor, nil)
	logger.Infof("Shipment '%s' submitted for certification by '%s'", shipmentID, actor.alias)
	return nil
}

func (s *FoodtraceSmartContract) RecordCertification(ctx contractapi.TransactionContextInterface,
	shipmentID string, inspectionDateStr string, inspectionReportHash string,
	certStatusStr string, comments string) error {

	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("RecordCertification: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)
	if err := im.RequireRole("certifier"); err != nil {
		return err
	}

	logger.Infof("Certifier '%s' (alias: '%s') recording certification for shipment '%s'", actor.fullID, actor.alias, shipmentID)

	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return err
	}
	inspectionDate, err := parseDateString(inspectionDateStr, "inspectionDate", true)
	if err != nil {
		return err
	}
	if err := s.validateOptionalString(inspectionReportHash, "inspectionReportHash", maxStringInputLength); err != nil {
		return err
	}
	if err := s.validateOptionalString(comments, "comments", maxDescriptionLength); err != nil {
		return err
	}

	var certStatus model.CertificationStatus
	switch strings.ToUpper(certStatusStr) {
	case string(model.CertStatusApproved):
		certStatus = model.CertStatusApproved
	case string(model.CertStatusRejected):
		certStatus = model.CertStatusRejected
	case string(model.CertStatusPending):
		certStatus = model.CertStatusPending
	default:
		return fmt.Errorf("invalid certStatusStr '%s'. Must be one of: %s, %s, %s", certStatusStr, model.CertStatusApproved, model.CertStatusRejected, model.CertStatusPending)
	}

	if (certStatus == model.CertStatusApproved || certStatus == model.CertStatusRejected) && strings.TrimSpace(inspectionReportHash) == "" {
		logger.Warningf("Certifier '%s' is recording a final certification status ('%s') for shipment '%s' without providing an inspectionReportHash. This is allowed but not recommended.", actor.alias, certStatus, shipmentID)
	}

	shipment, err := s.getShipmentByID(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("RecordCertification: %w", err)
	}

	if (certStatus == model.CertStatusApproved || certStatus == model.CertStatusRejected) && shipment.Status != model.StatusPendingCertification {
		isCallerAdmin, _ := im.IsCurrentUserAdmin()
		if !isCallerAdmin {
			return fmt.Errorf("shipment '%s' is not in '%s' status (current: '%s'). Cannot record final decision '%s'. Only admin can override.",
				shipmentID, model.StatusPendingCertification, shipment.Status, certStatus)
		}
		logger.Warningf("Admin '%s' is overriding status check for recording certification on shipment '%s' (Current status: %s)", actor.alias, shipmentID, shipment.Status)
	}
	if shipment.RecallInfo.IsRecalled {
		return fmt.Errorf("recalled shipment '%s' cannot have certification recorded", shipmentID)
	}

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("RecordCertification: failed to get transaction timestamp: %w", err)
	}

	newCertificationRecord := model.CertificationRecord{
		CertifierID: actor.fullID, CertifierAlias: actor.alias, InspectionDate: inspectionDate,
		InspectionReportHash: inspectionReportHash, Status: certStatus, Comments: comments, CertifiedAt: now,
	}
	shipment.CertificationRecords = append(shipment.CertificationRecords, newCertificationRecord)

	switch certStatus {
	case model.CertStatusApproved:
		shipment.Status = model.StatusCertified
	case model.CertStatusRejected:
		shipment.Status = model.StatusCertificationRejected
	case model.CertStatusPending:
		if shipment.Status != model.StatusPendingCertification {
			shipment.Status = model.StatusPendingCertification
		}
	}
	shipment.LastUpdatedAt = now

	shipmentKey, _ := s.createShipmentCompositeKey(ctx, shipmentID)
	shipmentBytes, err := json.Marshal(shipment)
	if err != nil {
		return fmt.Errorf("RecordCertification: failed to marshal shipment '%s': %w", shipmentID, err)
	}
	if err := ctx.GetStub().PutState(shipmentKey, shipmentBytes); err != nil {
		return fmt.Errorf("RecordCertification: failed to update shipment '%s' on ledger: %w", shipmentID, err)
	}

	eventPayload := map[string]interface{}{
		"certifierId": actor.fullID, "certifierAlias": actor.alias, "inspectionDate": inspectionDate.Format(time.RFC3339),
		"certificationStatusRecord": certStatus, "overallShipmentStatus": shipment.Status, "comments": comments,
	}
	s.emitShipmentEvent(ctx, "ShipmentCertificationRecorded", shipment, actor, eventPayload)
	logger.Infof("Certification recorded for shipment '%s' by certifier '%s'. New overall status: '%s'", shipmentID, actor.alias, shipment.Status)
	return nil
}
