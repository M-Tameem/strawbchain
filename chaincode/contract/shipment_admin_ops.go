package contract

import (
	"encoding/json"
	"errors"
	"fmt"
	"foodtrace/model"
	"strings"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// --- Lifecycle: Admin Operations ---

// BootstrapLedger initializes the ledger with a bootstrap admin identity if no admin exists.
// FIXED: Improved to handle multiple calls gracefully
func (s *FoodtraceSmartContract) BootstrapLedger(ctx contractapi.TransactionContextInterface) error {
	logger.Info("Attempting to bootstrap ledger with initial admin (direct write method)...")
	im := NewIdentityManager(ctx) // Still useful for its helper methods like createKey

	anyAdminAlreadyExists, err := im.AnyAdminExists()
	if err != nil {
		return fmt.Errorf("BootstrapLedger: failed to check if any admin exists: %w", err)
	}
	if anyAdminAlreadyExists {
		msg := "system already has admins or is bootstrapped. BootstrapLedger should not be re-run."
		logger.Info(msg) // FIXED: Use Info instead of Warning for expected behavior
		// This is not an error if the script handles it, but for a strict bootstrap, it is.
		// The Python script checks for this specific message, so we should return it.
		return errors.New(msg)
	}

	callerActorInfo, err := s.getCurrentActorInfo(ctx) // Uses helper from shipment_helpers.go
	if err != nil {
		return fmt.Errorf("BootstrapLedger: failed to get caller identity for bootstrap: %w", err)
	}
	callerFullID := callerActorInfo.fullID
	bootstrapAdminAlias := callerActorInfo.alias        // Use the alias from getCurrentActorInfo
	bootstrapAdminEnrollmentID := callerActorInfo.alias // Or however enrollmentID is determined for bootstrap

	logger.Infof("BootstrapLedger: Preparing to register bootstrap admin '%s' (alias: '%s', enrollmentID: '%s') using direct state writes.",
		callerFullID, bootstrapAdminAlias, bootstrapAdminEnrollmentID)

	nowForBootstrap, tsErr := s.getCurrentTxTimestamp(ctx)
	if tsErr != nil {
		return fmt.Errorf("BootstrapLedger: failed to get timestamp for direct state writes: %w", tsErr)
	}

	// 1. Create and save IdentityInfo for the bootstrap admin directly
	bootstrapAdminInfo := model.IdentityInfo{
		ObjectType:      "IdentityInfo", // Constant from identity_manager.go
		FullID:          callerFullID,
		ShortName:       bootstrapAdminAlias,
		EnrollmentID:    bootstrapAdminEnrollmentID,
		OrganizationMSP: callerActorInfo.mspID,
		Roles:           []string{},   // First admin has no other specific roles by default
		IsAdmin:         true,         // Explicitly set to true
		RegisteredBy:    callerFullID, // Self-registered during bootstrap
		RegisteredAt:    nowForBootstrap,
		LastUpdatedAt:   nowForBootstrap,
	}
	identityKey, keyErr := im.createIdentityCompositeKey(callerFullID)
	if keyErr != nil {
		return fmt.Errorf("BootstrapLedger: failed to create identity key for bootstrap admin '%s': %w", callerFullID, keyErr)
	}
	bootstrapAdminInfoBytes, marshalErr := json.Marshal(bootstrapAdminInfo)
	if marshalErr != nil {
		return fmt.Errorf("BootstrapLedger: failed to marshal bootstrap admin IdentityInfo: %w", marshalErr)
	}
	if err := ctx.GetStub().PutState(identityKey, bootstrapAdminInfoBytes); err != nil {
		return fmt.Errorf("BootstrapLedger: failed to save bootstrap admin IdentityInfo for '%s': %w", callerFullID, err)
	}
	logger.Infof("BootstrapLedger: Bootstrap admin IdentityInfo for '%s' saved directly.", callerFullID)

	// 2. Create and save the Alias mapping directly
	aliasKey, aliasKeyErr := im.createAliasCompositeKey(bootstrapAdminAlias)
	if aliasKeyErr != nil {
		return fmt.Errorf("BootstrapLedger: failed to create alias key for bootstrap admin '%s': %w", bootstrapAdminAlias, aliasKeyErr)
	}
	if err := ctx.GetStub().PutState(aliasKey, []byte(callerFullID)); err != nil {
		// Consider cleanup if this fails after IdentityInfo is saved? For bootstrap, might be okay to error out.
		return fmt.Errorf("BootstrapLedger: failed to save bootstrap admin alias mapping '%s' -> '%s': %w", bootstrapAdminAlias, callerFullID, err)
	}
	logger.Infof("BootstrapLedger: Bootstrap admin alias mapping for '%s' -> '%s' saved directly.", bootstrapAdminAlias, callerFullID)

	// 3. Create and save the AdminFlag directly
	adminFlagKey, flagKeyErr := im.createAdminFlagCompositeKey(callerFullID)
	if flagKeyErr != nil {
		return fmt.Errorf("BootstrapLedger: failed to create admin flag key for '%s': %w", callerFullID, flagKeyErr)
	}
	if err := ctx.GetStub().PutState(adminFlagKey, []byte("true")); err != nil {
		// Consider cleanup if this fails.
		return fmt.Errorf("BootstrapLedger: failed to set admin flag for bootstrap admin '%s': %w", callerFullID, err)
	}
	logger.Infof("BootstrapLedger: Bootstrap admin flag for '%s' set directly.", callerFullID)

	logger.Infof("BootstrapLedger: Ledger bootstrapped successfully using direct state writes. Identity '%s' (alias: '%s') is now an admin.", callerFullID, bootstrapAdminAlias)
	return nil
}

func (s *FoodtraceSmartContract) ArchiveShipment(ctx contractapi.TransactionContextInterface, shipmentID string, archiveReason string) error {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("ArchiveShipment: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)
	if err := s.requireAdmin(ctx, im); err != nil { // requireAdmin is in shipment_helpers.go
		return fmt.Errorf("ArchiveShipment: %w. Caller: %s", err, actor.alias)
	}

	logger.Infof("Admin '%s' (alias: '%s') attempting to archive shipment '%s'. Reason: %s", actor.fullID, actor.alias, shipmentID, archiveReason)

	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil { // validateRequiredString is in shipment_helpers.go
		return err
	}
	if err := s.validateOptionalString(archiveReason, "archiveReason", maxDescriptionLength); err != nil { // validateOptionalString is in shipment_helpers.go
		return err
	}

	shipment, err := s.getShipmentByID(ctx, shipmentID) // getShipmentByID is in shipment_query_ops.go (but used as a helper here)
	if err != nil {
		return fmt.Errorf("ArchiveShipment: failed to get shipment '%s': %w", shipmentID, err)
	}

	if shipment.IsArchived {
		logger.Infof("ArchiveShipment: Shipment '%s' is already archived. No changes made.", shipmentID)
		return nil
	}

	now, err := s.getCurrentTxTimestamp(ctx) // getCurrentTxTimestamp is in shipment_helpers.go
	if err != nil {
		return fmt.Errorf("ArchiveShipment: failed to get transaction timestamp: %w", err)
	}

	shipment.IsArchived = true
	shipment.LastUpdatedAt = now
	// shipment.ArchiveReason = archiveReason // Add to model if persistent reason is needed

	shipmentKey, _ := s.createShipmentCompositeKey(ctx, shipmentID) // createShipmentCompositeKey is in shipment_helpers.go
	shipmentBytes, errMarshal := json.Marshal(shipment)
	if errMarshal != nil {
		return fmt.Errorf("ArchiveShipment: failed to marshal shipment '%s': %w", shipmentID, errMarshal)
	}
	if errPut := ctx.GetStub().PutState(shipmentKey, shipmentBytes); errPut != nil {
		return fmt.Errorf("ArchiveShipment: failed to save archived shipment '%s': %w", shipmentID, errPut)
	}

	s.emitShipmentEvent(ctx, "ShipmentArchived", shipment, actor, map[string]interface{}{"archiveReason": archiveReason}) // emitShipmentEvent is in shipment_helpers.go
	logger.Infof("Shipment '%s' successfully archived by admin '%s'.", shipmentID, actor.alias)
	return nil
}

func (s *FoodtraceSmartContract) UnarchiveShipment(ctx contractapi.TransactionContextInterface, shipmentID string) error {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return fmt.Errorf("UnarchiveShipment: failed to get actor info: %w", err)
	}
	im := NewIdentityManager(ctx)
	if err := s.requireAdmin(ctx, im); err != nil {
		return fmt.Errorf("UnarchiveShipment: %w. Caller: %s", err, actor.alias)
	}

	logger.Infof("Admin '%s' (alias: '%s') attempting to unarchive shipment '%s'.", actor.fullID, actor.alias, shipmentID)

	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return err
	}

	shipment, err := s.getShipmentByID(ctx, shipmentID)
	if err != nil {
		return fmt.Errorf("UnarchiveShipment: failed to get shipment '%s': %w", shipmentID, err)
	}

	if !shipment.IsArchived {
		logger.Infof("UnarchiveShipment: Shipment '%s' is not currently archived. No changes made.", shipmentID)
		return nil
	}

	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("UnarchiveShipment: failed to get transaction timestamp: %w", err)
	}

	shipment.IsArchived = false
	shipment.LastUpdatedAt = now

	shipmentKey, _ := s.createShipmentCompositeKey(ctx, shipmentID)
	shipmentBytes, errMarshal := json.Marshal(shipment)
	if errMarshal != nil {
		return fmt.Errorf("UnarchiveShipment: failed to marshal shipment '%s': %w", shipmentID, errMarshal)
	}
	if errPut := ctx.GetStub().PutState(shipmentKey, shipmentBytes); errPut != nil {
		return fmt.Errorf("UnarchiveShipment: failed to save unarchived shipment '%s': %w", shipmentID, errPut)
	}

	s.emitShipmentEvent(ctx, "ShipmentUnarchived", shipment, actor, nil)
	logger.Infof("Shipment '%s' successfully unarchived by admin '%s'.", shipmentID, actor.alias)
	return nil
}

// --- Test Helper Functions ---
// IMPORTANT: These functions are for testing/development purposes.
// They should be removed or heavily guarded in a production environment.

func (s *FoodtraceSmartContract) TestGetCallerIdentity(ctx contractapi.TransactionContextInterface) (map[string]string, error) {
	logger.Warning("TESTING FUNCTION TestGetCallerIdentity called. This should NOT be used in production directly.")
	im := NewIdentityManager(ctx)
	fullID, err := im.GetCurrentIdentityFullID()
	if err != nil {
		fullID = "ERROR_GETTING_ID: " + err.Error()
	}
	alias := "N/A (not registered or error)"
	enrollID, err := im.GetCurrentEnrollmentID() // This is from IdentityManager
	if err != nil {
		enrollID = "ERROR_GETTING_ENROLL_ID: " + err.Error()
	}
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		mspID = "ERROR_GETTING_MSPID: " + err.Error()
	}

	idInfo, errInfo := im.GetIdentityInfo(fullID) // This is from IdentityManager
	if errInfo == nil && idInfo != nil {
		alias = idInfo.ShortName
		if idInfo.EnrollmentID != "" {
			enrollID = idInfo.EnrollmentID
		}
	} else if fullID != "" && !strings.HasPrefix(fullID, "ERROR") { // Only log if fullID was obtained and not an error itself
		logger.Debugf("TestGetCallerIdentity: Could not get IdentityInfo for %s: %v", fullID, errInfo)
	}
	return map[string]string{"fullId": fullID, "alias": alias, "enrollmentId": enrollID, "mspId": mspID}, nil
}

// contract/shipment_admin_ops.go

// ...
func (s *FoodtraceSmartContract) TestAssignRoleToSelf(ctx contractapi.TransactionContextInterface, role string) error {
    logger.Warningf("TESTING FUNCTION TestAssignRoleToSelf called for role '%s'. This should NOT be used in production directly.", role)
    im := NewIdentityManager(ctx)
    actorInfoFromContract, err := s.getCurrentActorInfo(ctx) 
    if err != nil {
        return fmt.Errorf("TestAssignRoleToSelf: failed to get caller info: %w", err)
    }

    isCallerAdmin, adminErr := im.IsCurrentUserAdmin()
    if adminErr != nil {
        logger.Debugf("TestAssignRoleToSelf: Could not check admin status: %v", adminErr)
    }

    // Attempt to get existing IdentityInfo
    _, err = im.GetIdentityInfo(actorInfoFromContract.fullID) // MODIFIED HERE
    // REMOVE THIS LINE COMPLETELY: idInfo = nil 
    if err != nil && strings.Contains(err.Error(), "not found") {
        logger.Infof("TestAssignRoleToSelf: Caller '%s' (alias '%s') not registered. Attempting test self-registration.", actorInfoFromContract.fullID, actorInfoFromContract.alias)
        
        anyAdminExists, adminCheckErr := im.AnyAdminExists()
        if adminCheckErr != nil {
            return fmt.Errorf("TestAssignRoleToSelf: failed to check admin existence: %w", adminCheckErr)
        }
        
        if !anyAdminExists || isCallerAdmin {
            regErr := im.RegisterIdentity(actorInfoFromContract.fullID, actorInfoFromContract.alias, actorInfoFromContract.alias)
            if regErr != nil {
                return fmt.Errorf("TestAssignRoleToSelf: failed to self-register for test: %w", regErr)
            }
            logger.Infof("TestAssignRoleToSelf: Self-registered '%s' with alias '%s'.", actorInfoFromContract.fullID, actorInfoFromContract.alias)
        } else {
            return fmt.Errorf("TestAssignRoleToSelf: cannot self-register when admins exist and caller is not admin")
        }
        
        // Re-fetch after registration
        _, err = im.GetIdentityInfo(actorInfoFromContract.fullID) // MODIFIED HERE
        if err != nil {
            return fmt.Errorf("TestAssignRoleToSelf: failed to get IdentityInfo after self-registration: %w", err)
        }
    } else if err != nil {
        return fmt.Errorf("TestAssignRoleToSelf: error getting identity info: %w", err)
    }

    // Use the unchecked role assignment for testing
    err = im.AssignRoleUncheckedForTest(actorInfoFromContract.fullID, role)
    if err != nil {
        return fmt.Errorf("TestAssignRoleToSelf: AssignRoleUncheckedForTest failed for role '%s': %w", role, err)
    }
    
    logger.Infof("TestAssignRoleToSelf: Successfully assigned role '%s' to self '%s' via test method.", role, actorInfoFromContract.fullID)
    return nil
}
// ...
// FIXED: Add a helper function to get full ID for alias (for Python script)
func (s *FoodtraceSmartContract) GetFullIDForAlias(ctx contractapi.TransactionContextInterface, alias string) (string, error) {
	im := NewIdentityManager(ctx)
	return im.ResolveIdentity(alias)
}