package contract

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"foodtrace/model" // Correct and clean import based on your go.mod

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric/common/flogging"
)

var idLogger = flogging.MustGetLogger("foodtrace.identitymanager")

// Object types for composite keys, also usable as 'docType' or 'objectType' in CouchDB.
const (
	identityObjectType  = "IdentityInfo" // Stores IdentityInfo objects. Attribute for composite key: FullID.
	aliasObjectType     = "Alias"        // Maps ShortName (alias) to FullID. Attribute for composite key: ShortName.
	adminFlagObjectType = "AdminFlag"    // Stores a flag for admin status. Attribute for composite key: FullID.
)

// ValidRoles defines the set of permissible roles in the system.
var ValidRoles = map[string]bool{
	"farmer":      true,
	"processor":   true,
	"distributor": true,
	"retailer":    true,
	"certifier":   true, // <<< NEWLY ADDED ROLE
	// "admin" is a special status, managed by IsAdmin, not a role in this list.
}

// IdentityManager handles identity registration, role management, and admin privileges.
type IdentityManager struct {
	Ctx contractapi.TransactionContextInterface
}

// NewIdentityManager creates a new instance of IdentityManager.
func NewIdentityManager(ctx contractapi.TransactionContextInterface) *IdentityManager {
	return &IdentityManager{Ctx: ctx}
}

// --- Internal Helper Functions ---

func (im *IdentityManager) getCurrentTxTimestamp() (time.Time, error) {
	ts, err := im.Ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return time.Time{}, fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	return ts.AsTime(), nil
}

func isValidX509ID(id string) bool {
	// Basic check, can be enhanced if specific X.509 formats are enforced.
	return strings.HasPrefix(id, "x509::") || strings.HasPrefix(id, "eDUwOTo6") // "eDUwOTo6" is "x509::" base64 encoded
}

func (im *IdentityManager) getListOfValidRoles() []string {
	keys := make([]string, 0, len(ValidRoles))
	for k := range ValidRoles {
		keys = append(keys, k)
	}
	return keys
}

// --- Key Creation Helpers (using Composite Keys) ---

func (im *IdentityManager) createIdentityCompositeKey(fullID string) (string, error) {
	return im.Ctx.GetStub().CreateCompositeKey(identityObjectType, []string{fullID})
}

func (im *IdentityManager) createAliasCompositeKey(shortName string) (string, error) {
	return im.Ctx.GetStub().CreateCompositeKey(aliasObjectType, []string{shortName})
}

func (im *IdentityManager) createAdminFlagCompositeKey(fullID string) (string, error) {
	return im.Ctx.GetStub().CreateCompositeKey(adminFlagObjectType, []string{fullID})
}

// --- Public Identity Management Functions ---

func (im *IdentityManager) RegisterIdentity(targetFullID, shortName, enrollmentID string) error {
	// Check if any admin exists. If not, this is a bootstrap scenario for RegisterIdentity.
	anyAdminCurrentlyExists, err := im.AnyAdminExists()
	if err != nil {
		return fmt.Errorf("failed to check if any admin exists during RegisterIdentity: %w", err)
	}

	callerFullID, err := im.GetCurrentIdentityFullID() // Get caller ID early for logging/use
	if err != nil {
		// If we can't get the caller ID, it might be a very early bootstrap or error
		idLogger.Warningf("RegisterIdentity: Could not get current caller's FullID: %v", err)
		// Depending on policy, might allow if no admins exist, or deny.
		// For now, let it proceed if no admins exist, but this is a risky state.
		if anyAdminCurrentlyExists { // If admins exist, not knowing caller is definitely a problem.
			return fmt.Errorf("failed to get current caller's FullID: %w", err)
		}
		callerFullID = "SYSTEM_BOOTSTRAP" // Placeholder if no admins and no caller ID
	}

	if anyAdminCurrentlyExists { // If admins DO exist, then the caller MUST be an admin
		isCallerAdmin, errAdminCheck := im.IsCurrentUserAdmin() // This uses the resolved callerFullID
		if errAdminCheck != nil {
			return fmt.Errorf("failed to verify caller admin status for RegisterIdentity: %w", errAdminCheck)
		}
		if !isCallerAdmin {
			return fmt.Errorf("caller '%s' is not authorized to register identities as admins already exist in the system", callerFullID)
		}
		idLogger.Infof("RegisterIdentity authorized: Caller '%s' is admin.", callerFullID)
	} else {
		idLogger.Infof("RegisterIdentity proceeding in bootstrap mode (no admins exist or caller ID not available): Caller assumed '%s'.", callerFullID)
	}

	if !isValidX509ID(targetFullID) {
		return fmt.Errorf("targetFullID '%s' is not a valid X.509 ID format", targetFullID)
	}
	if strings.TrimSpace(shortName) == "" {
		return errors.New("shortName cannot be empty")
	}
	// EnrollmentID can be empty, it's optional or might be derived.

	now, err := im.getCurrentTxTimestamp()
	if err != nil {
		return err
	}

	// Get target's MSPID from the caller's context. This assumes the admin registering
	// the identity is doing so for an identity within their own MSP or an MSP they manage.
	// If registering for a *different* MSP, this would need to be an explicit parameter.
	targetMSPID := ""
	clientIdentity := im.Ctx.GetClientIdentity()
	if clientIdentity != nil { // Check if clientIdentity is available (might not be in some test/bootstrap scenarios)
		mspID, mspErr := clientIdentity.GetMSPID()
		if mspErr != nil {
			idLogger.Warningf("Could not determine MSPID for identity %s from caller's context: %v. Storing empty MSPID.", targetFullID, mspErr)
		} else {
			targetMSPID = mspID
		}
	} else {
		idLogger.Warningf("ClientIdentity not available from context for determining MSPID for %s. Storing empty MSPID.", targetFullID)
	}

	aliasKey, err := im.createAliasCompositeKey(shortName)
	if err != nil {
		return fmt.Errorf("failed to create alias composite key for '%s': %w", shortName, err)
	}
	existingFullIDForAliasBytes, err := im.Ctx.GetStub().GetState(aliasKey)
	if err != nil {
		return fmt.Errorf("failed to check alias availability for '%s': %w", shortName, err)
	}
	if existingFullIDForAliasBytes != nil && string(existingFullIDForAliasBytes) != targetFullID {
		return fmt.Errorf("shortName (alias) '%s' is already in use by identity '%s'", shortName, string(existingFullIDForAliasBytes))
	}

	identityKey, err := im.createIdentityCompositeKey(targetFullID)
	if err != nil {
		return fmt.Errorf("failed to create identity composite key for '%s': %w", targetFullID, err)
	}
	identityInfoBytes, err := im.Ctx.GetStub().GetState(identityKey)
	if err != nil {
		return fmt.Errorf("failed to get identity state for '%s': %w", targetFullID, err)
	}

	var idInfo model.IdentityInfo
	if identityInfoBytes == nil {
		idInfo = model.IdentityInfo{
			ObjectType:      identityObjectType,
			FullID:          targetFullID,
			ShortName:       shortName,
			EnrollmentID:    enrollmentID,
			OrganizationMSP: targetMSPID,
			Roles:           []string{},
			IsAdmin:         false,
			RegisteredBy:    callerFullID, // Could be "SYSTEM_BOOTSTRAP" if no admins yet
			RegisteredAt:    now,
			LastUpdatedAt:   now,
		}
		idLogger.Infof("Registering new identity: %s with alias %s, MSP %s, by %s", targetFullID, shortName, targetMSPID, idInfo.RegisteredBy)
	} else {
		if err := json.Unmarshal(identityInfoBytes, &idInfo); err != nil {
			return fmt.Errorf("failed to unmarshal existing IdentityInfo for '%s': %w", targetFullID, err)
		}
		if idInfo.ShortName != shortName && idInfo.ShortName != "" {
			oldAliasKey, keyErr := im.createAliasCompositeKey(idInfo.ShortName)
			if keyErr == nil {
				if errDel := im.Ctx.GetStub().DelState(oldAliasKey); errDel != nil {
					idLogger.Warningf("Failed to delete old alias key '%s' for identity '%s': %v", oldAliasKey, targetFullID, errDel)
				}
			} else {
				idLogger.Warningf("Failed to create key for old alias '%s' for deletion: %v", idInfo.ShortName, keyErr)
			}
		}
		idInfo.ShortName = shortName
		idInfo.EnrollmentID = enrollmentID   // Update enrollment ID
		idInfo.OrganizationMSP = targetMSPID // Update MSP ID
		idInfo.LastUpdatedAt = now
		// idInfo.RegisteredBy and idInfo.RegisteredAt should remain from original registration
		idLogger.Infof("Updating existing identity: %s with new alias %s, MSP %s. Updated by %s", targetFullID, shortName, targetMSPID, callerFullID)
	}

	updatedIdentityInfoBytes, err := json.Marshal(idInfo)
	if err != nil {
		return fmt.Errorf("failed to marshal IdentityInfo for '%s': %w", targetFullID, err)
	}
	if err := im.Ctx.GetStub().PutState(identityKey, updatedIdentityInfoBytes); err != nil {
		return fmt.Errorf("failed to save IdentityInfo for '%s': %w", targetFullID, err)
	}

	if err := im.Ctx.GetStub().PutState(aliasKey, []byte(targetFullID)); err != nil {
		return fmt.Errorf("failed to save alias mapping for '%s' -> '%s' (IdentityInfo saved, but alias mapping failed): %w", shortName, targetFullID, err)
	}

	return nil
}

// Improved ResolveIdentity with better handling for test scenarios
func (im *IdentityManager) ResolveIdentity(identityOrAlias string) (string, error) {
	trimmedInput := strings.TrimSpace(identityOrAlias)
	if trimmedInput == "" {
		return "", errors.New("identityOrAlias cannot be empty")
	}

	// If it's already a full X.509 ID, return as-is
	if isValidX509ID(trimmedInput) {
		return trimmedInput, nil
	}

	// Try to resolve as alias
	aliasKey, err := im.createAliasCompositeKey(trimmedInput)
	if err != nil {
		return "", fmt.Errorf("failed to create alias composite key for resolving '%s': %w", trimmedInput, err)
	}
	fullIDBytes, err := im.Ctx.GetStub().GetState(aliasKey)
	if err != nil {
		return "", fmt.Errorf("ledger error when querying alias '%s': %w", trimmedInput, err)
	}
	if fullIDBytes != nil {
		return string(fullIDBytes), nil
	}

	// For test scenarios, if alias not found, log but still return error
	idLogger.Debugf("Alias '%s' not found in ledger. In test scenarios, this might be expected.", trimmedInput)
	return "", fmt.Errorf("alias '%s' not found", trimmedInput)
}

// Add a test-friendly identity resolution method
func (im *IdentityManager) ResolveIdentityForTest(identityOrAlias string) (string, error) {
	// Try normal resolution first
	resolved, err := im.ResolveIdentity(identityOrAlias)
	if err == nil {
		return resolved, nil
	}

	// If not found and it looks like an alias, generate a test full ID
	if !isValidX509ID(identityOrAlias) {
		testFullID := fmt.Sprintf("x509::%s::OU=client::CN=%s", identityOrAlias, identityOrAlias)
		idLogger.Debugf("ResolveIdentityForTest: Generated test full ID '%s' for alias '%s'", testFullID, identityOrAlias)
		return testFullID, nil
	}

	return "", err
}

func (im *IdentityManager) GetIdentityInfo(identityOrAlias string) (*model.IdentityInfo, error) {
	fullID, err := im.ResolveIdentity(identityOrAlias)
	if err != nil {
		return nil, err // Error from ResolveIdentity is descriptive enough
	}
	return im.getIdentityInfoByFullID(fullID)
}

func (im *IdentityManager) getIdentityInfoByFullID(fullID string) (*model.IdentityInfo, error) {
	if !isValidX509ID(fullID) { // Should already be validated if coming via ResolveIdentity
		return nil, fmt.Errorf("'%s' is not a valid X.509 ID format for getIdentityInfoByFullID", fullID)
	}
	identityKey, err := im.createIdentityCompositeKey(fullID)
	if err != nil {
		return nil, fmt.Errorf("failed to create identity composite key for '%s': %w", fullID, err)
	}
	identityInfoBytes, err := im.Ctx.GetStub().GetState(identityKey)
	if err != nil {
		return nil, fmt.Errorf("ledger error retrieving IdentityInfo for FullID '%s': %w", fullID, err)
	}
	if identityInfoBytes == nil {
		return nil, fmt.Errorf("identity record not found for FullID '%s'", fullID)
	}
	var idInfo model.IdentityInfo
	if err := json.Unmarshal(identityInfoBytes, &idInfo); err != nil {
		return nil, fmt.Errorf("failed to unmarshal IdentityInfo for FullID '%s': %w", fullID, err)
	}
	return &idInfo, nil
}

func (im *IdentityManager) AssignRole(targetIdentityOrAlias, role string) error {
	callerFullID, err := im.GetCurrentIdentityFullID()
	if err != nil {
		return fmt.Errorf("failed to get caller's FullID for AssignRole: %w", err)
	}
	isCallerAdmin, err := im.IsAdmin(callerFullID) // Check if the specific caller is admin
	if err != nil {
		return fmt.Errorf("failed to verify caller admin status for AssignRole: %w", err)
	}
	if !isCallerAdmin {
		return fmt.Errorf("caller '%s' is not authorized to assign roles", callerFullID)
	}

	roleLower := strings.ToLower(strings.TrimSpace(role))
	if !ValidRoles[roleLower] {
		return fmt.Errorf("invalid role: '%s'. Valid roles are: %v", role, im.getListOfValidRoles())
	}

	targetFullID, err := im.ResolveIdentity(targetIdentityOrAlias)
	if err != nil {
		return fmt.Errorf("failed to resolve target identity '%s' for AssignRole: %w", targetIdentityOrAlias, err)
	}

	idInfo, err := im.getIdentityInfoByFullID(targetFullID)
	if err != nil {
		return fmt.Errorf("cannot assign role: target identity '%s' (resolved to '%s') must be registered first: %w", targetIdentityOrAlias, targetFullID, err)
	}

	for _, existingRole := range idInfo.Roles {
		if existingRole == roleLower {
			idLogger.Infof("Role '%s' already assigned to identity '%s' (%s). No action needed.", roleLower, idInfo.ShortName, targetFullID)
			return nil
		}
	}

	now, err := im.getCurrentTxTimestamp()
	if err != nil {
		return err
	}
	idInfo.Roles = append(idInfo.Roles, roleLower)
	idInfo.LastUpdatedAt = now

	updatedBytes, err := json.Marshal(idInfo)
	if err != nil {
		return fmt.Errorf("failed to marshal IdentityInfo for role assignment: %w", err)
	}
	identityKey, err := im.createIdentityCompositeKey(targetFullID)
	if err != nil {
		return fmt.Errorf("failed to create identity key for role assignment: %w", err)
	}

	if err := im.Ctx.GetStub().PutState(identityKey, updatedBytes); err != nil {
		return fmt.Errorf("failed to save IdentityInfo after role assignment for '%s': %w", targetFullID, err)
	}
	idLogger.Infof("Role '%s' successfully assigned to identity '%s' (%s) by admin '%s'.", roleLower, idInfo.ShortName, targetFullID, callerFullID)
	return nil
}

func (im *IdentityManager) RemoveRole(targetIdentityOrAlias, role string) error {
	callerFullID, err := im.GetCurrentIdentityFullID()
	if err != nil {
		return fmt.Errorf("failed to get caller's FullID for RemoveRole: %w", err)
	}
	isCallerAdmin, err := im.IsAdmin(callerFullID)
	if err != nil {
		return fmt.Errorf("failed to verify caller admin status for RemoveRole: %w", err)
	}
	if !isCallerAdmin {
		return fmt.Errorf("caller '%s' is not authorized to remove roles", callerFullID)
	}

	roleLower := strings.ToLower(strings.TrimSpace(role))
	// No need to check if roleLower is in ValidRoles, as we are removing it.

	targetFullID, err := im.ResolveIdentity(targetIdentityOrAlias)
	if err != nil {
		return fmt.Errorf("failed to resolve target identity '%s' for RemoveRole: %w", targetIdentityOrAlias, err)
	}

	idInfo, err := im.getIdentityInfoByFullID(targetFullID)
	if err != nil {
		return fmt.Errorf("cannot remove role: target identity '%s' (resolved to '%s') not found: %w", targetIdentityOrAlias, targetFullID, err)
	}

	found := false
	newRoles := []string{}
	for _, r := range idInfo.Roles {
		if r == roleLower {
			found = true
		} else {
			newRoles = append(newRoles, r)
		}
	}

	if !found {
		idLogger.Infof("Role '%s' not found for identity '%s' (%s). No action taken for removal.", roleLower, idInfo.ShortName, targetFullID)
		return nil
	}

	now, err := im.getCurrentTxTimestamp()
	if err != nil {
		return err
	}
	idInfo.Roles = newRoles
	idInfo.LastUpdatedAt = now

	updatedBytes, err := json.Marshal(idInfo)
	if err != nil {
		return fmt.Errorf("failed to marshal IdentityInfo for role removal: %w", err)
	}
	identityKey, err := im.createIdentityCompositeKey(targetFullID)
	if err != nil {
		return fmt.Errorf("failed to create identity key for role removal: %w", err)
	}

	if err := im.Ctx.GetStub().PutState(identityKey, updatedBytes); err != nil {
		return fmt.Errorf("failed to save IdentityInfo after role removal for '%s': %w", targetFullID, err)
	}
	idLogger.Infof("Role '%s' successfully removed from identity '%s' (%s) by admin '%s'.", roleLower, idInfo.ShortName, targetFullID, callerFullID)
	return nil
}

func (im *IdentityManager) HasRole(identityOrAlias, role string) (bool, error) {
	idInfo, err := im.GetIdentityInfo(identityOrAlias)
	if err != nil {
		if strings.Contains(err.Error(), "not found") { // If identity itself not found, it has no roles.
			return false, nil
		}
		return false, fmt.Errorf("error resolving identity '%s' to check role: %w", identityOrAlias, err)
	}
	roleLower := strings.ToLower(strings.TrimSpace(role))
	for _, r := range idInfo.Roles {
		if r == roleLower {
			return true, nil
		}
	}
	return false, nil
}

func (im *IdentityManager) RequireRole(requiredRole string) error {
	callerFullID, err := im.GetCurrentIdentityFullID()
	if err != nil {
		return fmt.Errorf("failed to get current user's FullID for RequireRole: %w", err)
	}

	isAdmin, err := im.IsAdmin(callerFullID) // Check if the specific caller is admin
	if err != nil {
		return fmt.Errorf("failed to check current user '%s' admin status for RequireRole: %w", callerFullID, err)
	}
	if isAdmin {
		idLogger.Debugf("Admin user '%s' authorized for role '%s' check (bypassed role requirement).", callerFullID, requiredRole)
		return nil
	}

	has, err := im.HasRole(callerFullID, requiredRole)
	if err != nil {
		return fmt.Errorf("error checking role '%s' for current user '%s': %w", requiredRole, callerFullID, err)
	}
	if !has {
		return fmt.Errorf("unauthorized: identity '%s' does not have required role '%s'", callerFullID, requiredRole)
	}
	idLogger.Debugf("Role check passed for role '%s' for user '%s'.", requiredRole, callerFullID)
	return nil
}

func (im *IdentityManager) MakeAdmin(targetIdentityOrAlias string) error {
	anyAdminExists, err := im.AnyAdminExists()
	if err != nil {
		return fmt.Errorf("failed to check if any admin exists for MakeAdmin: %w", err)
	}

	callerFullID := MustGetCallerFullID(im.Ctx) // Get current caller's ID (utility function)
	if anyAdminExists {
		isCallerAdmin, errAdm := im.IsAdmin(callerFullID)
		if errAdm != nil {
			return fmt.Errorf("failed to verify caller '%s' admin status for MakeAdmin: %w", callerFullID, errAdm)
		}
		if !isCallerAdmin {
			return fmt.Errorf("caller '%s' is not authorized to make others admin", callerFullID)
		}
	} else {
		// This is a bootstrap scenario for making the *first* admin(s).
		// The caller (e.g., instantiator of BootstrapLedger) is effectively self-authorizing here.
		idLogger.Infof("No admins exist. Bootstrap: Caller '%s' is making target '%s' an admin.", callerFullID, targetIdentityOrAlias)
	}

	targetFullID, err := im.ResolveIdentity(targetIdentityOrAlias)
	if err != nil {
		return fmt.Errorf("failed to resolve target identity '%s' to make admin: %w", targetIdentityOrAlias, err)
	}

	idInfo, err := im.getIdentityInfoByFullID(targetFullID)
	if err != nil {
		return fmt.Errorf("cannot make admin: target identity '%s' (resolved to '%s') must be registered first: %w", targetIdentityOrAlias, targetFullID, err)
	}

	adminFlagKey, err := im.createAdminFlagCompositeKey(targetFullID)
	if err != nil {
		return fmt.Errorf("failed to create admin flag key for MakeAdmin: %w", err)
	}

	if idInfo.IsAdmin { // Also check the flag to ensure consistency
		flagBytes, _ := im.Ctx.GetStub().GetState(adminFlagKey)
		if flagBytes != nil && string(flagBytes) == "true" {
			idLogger.Infof("Identity '%s' (%s) is already an admin (both in IdentityInfo and AdminFlag). No action needed.", idInfo.ShortName, targetFullID)
			return nil
		}
		idLogger.Warningf("Identity '%s' (%s) IsAdmin flag in IdentityInfo is true, but AdminFlag might be missing/false. Proceeding to set both.", idInfo.ShortName, targetFullID)
	}

	now, err := im.getCurrentTxTimestamp()
	if err != nil {
		return err
	}
	idInfo.IsAdmin = true
	idInfo.LastUpdatedAt = now

	updatedBytes, err := json.Marshal(idInfo)
	if err != nil {
		return fmt.Errorf("failed to marshal IdentityInfo for MakeAdmin: %w", err)
	}
	identityKey, err := im.createIdentityCompositeKey(targetFullID)
	if err != nil {
		return fmt.Errorf("failed to create identity key for MakeAdmin: %w", err)
	}

	// Transactionality: Update IdentityInfo first, then AdminFlag. If AdminFlag fails, attempt to roll back IdentityInfo.
	if err := im.Ctx.GetStub().PutState(identityKey, updatedBytes); err != nil {
		return fmt.Errorf("failed to save IdentityInfo after setting IsAdmin for '%s': %w", targetFullID, err)
	}
	if err := im.Ctx.GetStub().PutState(adminFlagKey, []byte("true")); err != nil {
		// Attempt to roll back IsAdmin in IdentityInfo
		idLogger.Errorf("CRITICAL: Failed to set admin flag for '%s' after updating IdentityInfo. Attempting rollback of IsAdmin in IdentityInfo.", targetFullID)
		idInfo.IsAdmin = false                               // Rollback
		idInfo.LastUpdatedAt, _ = im.getCurrentTxTimestamp() // Update timestamp for rollback action
		updatedBytesRollback, _ := json.Marshal(idInfo)
		// No error check on identityKey creation as it succeeded before
		if errRb := im.Ctx.GetStub().PutState(identityKey, updatedBytesRollback); errRb != nil {
			idLogger.Errorf("CRITICAL ROLLBACK FAILURE: Failed to set admin flag for '%s' AND FAILED TO ROLLBACK IdentityInfo.IsAdmin. State is inconsistent. Original flag error: %v. Rollback error: %v", targetFullID, err, errRb)
		} else {
			idLogger.Infof("SUCCESSFUL ROLLBACK: Failed to set admin flag for '%s'. Rolled back IsAdmin in IdentityInfo. Original flag error: %v", targetFullID, err)
		}
		return fmt.Errorf("failed to set admin flag for '%s' (IdentityInfo.IsAdmin change was rolled back): %w", targetFullID, err)
	}
	idLogger.Infof("Identity '%s' (%s) has been made an admin by '%s'. Both IdentityInfo and AdminFlag updated.", idInfo.ShortName, targetFullID, callerFullID)
	return nil
}

func (im *IdentityManager) RemoveAdmin(targetIdentityOrAlias string) error {
	callerFullID, err := im.GetCurrentIdentityFullID()
	if err != nil {
		return fmt.Errorf("failed to get caller's FullID for RemoveAdmin: %w", err)
	}
	isCallerAdmin, err := im.IsAdmin(callerFullID)
	if err != nil {
		return fmt.Errorf("failed to verify caller '%s' admin status for RemoveAdmin: %w", callerFullID, err)
	}
	if !isCallerAdmin {
		return fmt.Errorf("caller '%s' is not authorized to remove admin privileges", callerFullID)
	}

	targetFullID, err := im.ResolveIdentity(targetIdentityOrAlias)
	if err != nil {
		return fmt.Errorf("failed to resolve target identity '%s' to remove admin: %w", targetIdentityOrAlias, err)
	}

	if targetFullID == callerFullID {
		return errors.New("admins cannot remove their own admin status")
	}

	adminFlagKey, err := im.createAdminFlagCompositeKey(targetFullID)
	if err != nil {
		return fmt.Errorf("failed to create admin flag key for RemoveAdmin: %w", err)
	}

	idInfo, err := im.getIdentityInfoByFullID(targetFullID)
	if err != nil { // IdentityInfo record might not exist, but flag might.
		idLogger.Warningf("IdentityInfo record for '%s' (resolved to '%s') not found during RemoveAdmin. Checking admin flag directly.", targetIdentityOrAlias, targetFullID)
		flagBytes, getErr := im.Ctx.GetStub().GetState(adminFlagKey)
		if getErr != nil {
			return fmt.Errorf("error checking admin flag for '%s' (IdentityInfo not found): %w", targetFullID, getErr)
		}
		if flagBytes != nil { // Flag exists, delete it.
			if errDel := im.Ctx.GetStub().DelState(adminFlagKey); errDel != nil {
				return fmt.Errorf("failed to remove admin flag for '%s' (IdentityInfo not found, flag deletion error): %w", targetFullID, errDel)
			}
			idLogger.Infof("Admin flag removed for '%s' (IdentityInfo was not found). Action by '%s'.", targetFullID, callerFullID)
			return nil
		}
		// Neither IdentityInfo nor admin flag found.
		return fmt.Errorf("cannot remove admin: target identity '%s' (resolved to '%s') not found and no admin flag present: %w", targetIdentityOrAlias, targetFullID, err)
	}

	// IdentityInfo exists, now check its IsAdmin status and the flag
	if !idInfo.IsAdmin {
		idLogger.Infof("Identity '%s' (%s) IsAdmin is already false. Ensuring admin flag is also cleared.", idInfo.ShortName, targetFullID)
		_ = im.Ctx.GetStub().DelState(adminFlagKey) // Best effort to clear flag if it was somehow set
		return nil
	}

	now, err := im.getCurrentTxTimestamp()
	if err != nil {
		return err
	}
	idInfo.IsAdmin = false
	idInfo.LastUpdatedAt = now

	updatedBytes, err := json.Marshal(idInfo)
	if err != nil {
		return fmt.Errorf("failed to marshal IdentityInfo for RemoveAdmin: %w", err)
	}
	identityKey, err := im.createIdentityCompositeKey(targetFullID)
	if err != nil {
		return fmt.Errorf("failed to create identity key for RemoveAdmin: %w", err)
	}

	// Transactionality: Update IdentityInfo first, then AdminFlag. If AdminFlag fails, attempt to roll back IdentityInfo.
	if err := im.Ctx.GetStub().PutState(identityKey, updatedBytes); err != nil {
		return fmt.Errorf("failed to save IdentityInfo after clearing IsAdmin for '%s': %w", targetFullID, err)
	}
	if err := im.Ctx.GetStub().DelState(adminFlagKey); err != nil {
		// Attempt to roll back IsAdmin in IdentityInfo
		idLogger.Errorf("CRITICAL: Failed to delete admin flag for '%s' after updating IdentityInfo. Attempting rollback of IsAdmin in IdentityInfo.", targetFullID)
		idInfo.IsAdmin = true // Rollback
		idInfo.LastUpdatedAt, _ = im.getCurrentTxTimestamp()
		updatedBytesRollback, _ := json.Marshal(idInfo)
		if errRb := im.Ctx.GetStub().PutState(identityKey, updatedBytesRollback); errRb != nil {
			idLogger.Errorf("CRITICAL ROLLBACK FAILURE: Failed to delete admin flag for '%s' AND FAILED TO ROLLBACK IdentityInfo.IsAdmin. State is inconsistent. Original flag error: %v. Rollback error: %v", targetFullID, err, errRb)
		} else {
			idLogger.Infof("SUCCESSFUL ROLLBACK: Failed to delete admin flag for '%s'. Rolled back IsAdmin in IdentityInfo. Original flag error: %v", targetFullID, err)
		}
		return fmt.Errorf("failed to delete admin flag for '%s' (IdentityInfo.IsAdmin change was rolled back): %w", targetFullID, err)
	}
	idLogger.Infof("Admin privileges removed from identity '%s' (%s) by '%s'. Both IdentityInfo and AdminFlag updated/cleared.", idInfo.ShortName, targetFullID, callerFullID)
	return nil
}

// IsAdmin checks if an identity has admin privileges primarily based on the AdminFlag.
// It can optionally cross-check with IdentityInfo.IsAdmin if needed, but AdminFlag is authoritative.
func (im *IdentityManager) IsAdmin(identityOrAlias string) (bool, error) {
	fullID, err := im.ResolveIdentity(identityOrAlias)
	if err != nil {
		if strings.Contains(err.Error(), "not found") { // Identity/Alias not found means not admin.
			return false, nil
		}
		return false, fmt.Errorf("error resolving identity '%s' for IsAdmin check: %w", identityOrAlias, err)
	}
	adminFlagKey, err := im.createAdminFlagCompositeKey(fullID)
	if err != nil {
		return false, fmt.Errorf("failed to create admin flag key for IsAdmin check on '%s': %w", fullID, err)
	}

	flagBytes, err := im.Ctx.GetStub().GetState(adminFlagKey)
	if err != nil {
		return false, fmt.Errorf("ledger error checking admin flag for '%s': %w", fullID, err)
	}

	isAdminByFlag := flagBytes != nil && string(flagBytes) == "true"

	// Optional: Cross-check with IdentityInfo for consistency, log if different.
	// idInfo, _ := im.getIdentityInfoByFullID(fullID)
	// if idInfo != nil && idInfo.IsAdmin != isAdminByFlag {
	// 	idLogger.Warningf("Admin status mismatch for %s: AdminFlag is %v, IdentityInfo.IsAdmin is %v. AdminFlag is authoritative.", fullID, isAdminByFlag, idInfo.IsAdmin)
	// }
	return isAdminByFlag, nil
}

func (im *IdentityManager) IsCurrentUserAdmin() (bool, error) {
	callerFullID, err := im.GetCurrentIdentityFullID()
	if err != nil {
		return false, fmt.Errorf("failed to get current user's FullID for admin check: %w", err)
	}
	return im.IsAdmin(callerFullID)
}

// AnyAdminExists checks if any admin flag is set on the ledger.
func (im *IdentityManager) AnyAdminExists() (bool, error) {
	iterator, err := im.Ctx.GetStub().GetStateByPartialCompositeKey(adminFlagObjectType, []string{})
	if err != nil {
		return false, fmt.Errorf("failed to query admin records for AnyAdminExists: %w", err)
	}
	defer iterator.Close() // Ensure iterator is closed
	return iterator.HasNext(), nil
}

// GetCurrentIdentityFullID retrieves the full X.509 ID of the current transactor.
func (im *IdentityManager) GetCurrentIdentityFullID() (string, error) {
	clientIdentity := im.Ctx.GetClientIdentity()
	if clientIdentity == nil {
		return "", errors.New("client identity is nil from context")
	}
	id, err := clientIdentity.GetID()
	if err != nil {
		return "", fmt.Errorf("failed to get client identity ID from context: %w", err)
	}
	if id == "" { // GetID can sometimes return empty string without error if not properly set up
		return "", errors.New("client identity ID from context is empty")
	}
	if !isValidX509ID(id) {
		idLogger.Warningf("Current client ID '%s' does not appear to be a standard X.509 format.", id)
	}
	return id, nil
}

// MustGetCallerFullID is a utility to get the caller's ID, returning a placeholder on error.
// Useful for logging when a full error return isn't desired.
func MustGetCallerFullID(ctx contractapi.TransactionContextInterface) string {
	clientIdentity := ctx.GetClientIdentity()
	if clientIdentity == nil {
		idLogger.Error("MustGetCallerFullID: Client identity is nil from context. Returning placeholder.")
		return "ERROR_NIL_CLIENT_IDENTITY"
	}
	id, err := clientIdentity.GetID()
	if err != nil {
		idLogger.Errorf("MustGetCallerFullID: Failed to get client identity ID: %v. Returning placeholder.", err)
		return "ERROR_GETTING_CALLER_ID"
	}
	if id == "" {
		idLogger.Error("MustGetCallerFullID: Client identity ID from context is empty. Returning placeholder.")
		return "ERROR_EMPTY_CALLER_ID"
	}
	return id
}

// GetCurrentEnrollmentID tries to get the enrollment ID from attributes or stored IdentityInfo.
func (im *IdentityManager) GetCurrentEnrollmentID() (string, error) {
	clientIdentity := im.Ctx.GetClientIdentity()
	if clientIdentity == nil {
		return "", errors.New("client identity is nil from context for GetCurrentEnrollmentID")
	}

	enrollmentID, found, errAttr := clientIdentity.GetAttributeValue("hf.EnrollmentID")
	if errAttr != nil {
		idLogger.Warningf("Error retrieving hf.EnrollmentID attribute: %v. Will try stored IdentityInfo.", errAttr)
	}
	if found && enrollmentID != "" {
		return enrollmentID, nil
	}

	// Fallback to checking stored IdentityInfo
	callerFullID, errFullID := im.GetCurrentIdentityFullID() // Uses the more robust GetCurrentIdentityFullID
	if errFullID == nil && callerFullID != "" {
		idInfo, errInfo := im.getIdentityInfoByFullID(callerFullID)
		if errInfo == nil && idInfo != nil && idInfo.EnrollmentID != "" {
			idLogger.Debugf("Retrieved EnrollmentID '%s' from stored IdentityInfo for %s.", idInfo.EnrollmentID, callerFullID)
			return idInfo.EnrollmentID, nil
		}
		if errInfo != nil {
			idLogger.Debugf("Could not get stored IdentityInfo for %s to find EnrollmentID: %v", callerFullID, errInfo)
		} else if idInfo == nil || idInfo.EnrollmentID == "" {
			idLogger.Debugf("Stored IdentityInfo for %s found but EnrollmentID is empty.", callerFullID)
		}
	} else if errFullID != nil {
		idLogger.Warningf("Could not get current FullID to check stored EnrollmentID: %v", errFullID)
	}

	// Further fallback to MSPID if other methods fail
	mspID, errMSPID := clientIdentity.GetMSPID()
	if errMSPID != nil {
		return "", fmt.Errorf("failed to get client MSPID as fallback for enrollment ID, and other methods failed (hf.EnrollmentID attr error: %v; FullID error: %v)", errAttr, errFullID)
	}
	if mspID == "" {
		return "", errors.New("failed to get client MSPID as fallback (MSPID is empty), and other methods for enrollment ID failed")
	}

	idLogger.Debugf("hf.EnrollmentID not found in attributes or stored IdentityInfo, using MSPID '%s' as EnrollmentID for current user '%s'.", mspID, callerFullID)
	return mspID, nil
}

func (im *IdentityManager) GetAllRegisteredIdentities() ([]model.IdentityInfo, error) {
	callerFullID, err := im.GetCurrentIdentityFullID()
	if err != nil {
		return nil, fmt.Errorf("failed to get caller's FullID for GetAllRegisteredIdentities: %w", err)
	}
	isCallerAdmin, err := im.IsAdmin(callerFullID)
	if err != nil {
		return nil, fmt.Errorf("failed to verify caller '%s' admin status for GetAllRegisteredIdentities: %w", callerFullID, err)
	}
	if !isCallerAdmin {
		return nil, fmt.Errorf("caller '%s' is not authorized to list all identities", callerFullID)
	}

	resultsIterator, err := im.Ctx.GetStub().GetStateByPartialCompositeKey(identityObjectType, []string{})
	if err != nil {
		return nil, fmt.Errorf("failed to get identities iterator using objectType '%s': %w", identityObjectType, err)
	}
	defer resultsIterator.Close()

	// FIXED: Initialize as empty slice, not nil
	identities := []model.IdentityInfo{}

	for resultsIterator.HasNext() {
		queryResponse, iterErr := resultsIterator.Next()
		if iterErr != nil {
			idLogger.Warningf("Failed to get next identity from iterator during GetAllRegisteredIdentities: %v. Skipping.", iterErr)
			continue
		}
		var idInfo model.IdentityInfo
		if err := json.Unmarshal(queryResponse.Value, &idInfo); err != nil {
			idLogger.Warningf("Failed to unmarshal identity data for key '%s', value '%s': %v. Skipping.", queryResponse.Key, string(queryResponse.Value), err)
			continue
		}
		identities = append(identities, idInfo)
	}
	idLogger.Infof("Admin '%s' retrieved %d registered identities.", callerFullID, len(identities))
	return identities, nil // Will be [] if empty, not null
}

// AssignRoleUncheckedForTest is a test-only function to assign a role without admin checks.
// THIS SHOULD NOT BE USED IN PRODUCTION. IT'S ADDED TO SUPPORT THE REFACTORED TestAssignRoleToSelf.
func (im *IdentityManager) AssignRoleUncheckedForTest(targetIdentityOrAlias, role string) error {
	idLogger.Warningf("TESTING FUNCTION AssignRoleUncheckedForTest called for role '%s' on '%s'. THIS IS NOT FOR PRODUCTION.", role, targetIdentityOrAlias)
	roleLower := strings.ToLower(strings.TrimSpace(role))
	if !ValidRoles[roleLower] { // Check against ValidRoles even for test
		return fmt.Errorf("invalid role for test: '%s'. Valid roles are: %v", role, im.getListOfValidRoles())
	}

	targetFullID, err := im.ResolveIdentity(targetIdentityOrAlias)
	if err != nil {
		return fmt.Errorf("failed to resolve target identity '%s' for test role assignment: %w", targetIdentityOrAlias, err)
	}

	idInfo, err := im.getIdentityInfoByFullID(targetFullID)
	if err != nil {
		// If identity not found, we might need to create a basic one for testing this specific function
		// However, for AssignRole, the identity should typically exist.
		return fmt.Errorf("cannot assign role for test: target identity '%s' (FullID: %s) not found: %w", targetIdentityOrAlias, targetFullID, err)
	}

	for _, existingRole := range idInfo.Roles {
		if existingRole == roleLower {
			idLogger.Infof("TestAssignRoleUnchecked: Role '%s' already present for '%s'.", roleLower, targetFullID)
			return nil // Already has role
		}
	}

	now, err := im.getCurrentTxTimestamp()
	if err != nil {
		return fmt.Errorf("TestAssignRoleUnchecked: failed to get timestamp: %w", err)
	}

	idInfo.Roles = append(idInfo.Roles, roleLower)
	idInfo.LastUpdatedAt = now

	updatedBytes, err := json.Marshal(idInfo)
	if err != nil {
		return fmt.Errorf("TestAssignRoleUnchecked: failed to marshal IdentityInfo: %w", err)
	}

	identityKey, err := im.createIdentityCompositeKey(targetFullID)
	if err != nil {
		return fmt.Errorf("TestAssignRoleUnchecked: failed to create identity key: %w", err)
	}

	err = im.Ctx.GetStub().PutState(identityKey, updatedBytes)
	if err == nil {
		idLogger.Infof("TestAssignRoleUnchecked: Role '%s' successfully added to '%s'.", roleLower, targetFullID)
	}
	return err
}
