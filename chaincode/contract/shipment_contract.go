package contract

import (
	"encoding/json"
	"errors"
	"fmt"
	"foodtrace/model" // Assuming model is in a direct subdirectory: foodtrace/model/
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric/common/flogging"
)

var logger = flogging.MustGetLogger("foodtrace.shipmentcontract")

// shipmentObjectType is used for composite keys and as a 'docType' for CouchDB queries.
const shipmentObjectType = "Shipment"

// Constants for input validation and limits
const (
	maxStringInputLength    = 256
	maxDescriptionLength    = 1024
	maxRecallReasonLength   = 512
	defaultRecallQueryHours = 72 // Default time window (+/- hours) for related shipment query
	maxArrayElements        = 50 // Arbitrary limit for arrays like QualityCertifications, TransitLocationLog
)

// FoodtraceSmartContract provides functions for managing food shipments.
// @contract:FoodtraceSmartContract
type FoodtraceSmartContract struct {
	contractapi.Contract
}

// actorInfo holds commonly needed details about the transaction invoker.
// This struct and its associated functions (getCurrentActorInfo, getCurrentTxTimestamp)
// are fundamental and used by many operations, so they remain in the core contract file.
type actorInfo struct {
	fullID string
	alias  string
	mspID  string
}

// Instantiate is called during chaincode instantiation.
// It's a lifecycle method of the contract.
func (s *FoodtraceSmartContract) Instantiate(ctx contractapi.TransactionContextInterface) {
	logger.Info("FoodtraceSmartContract Instantiated/Upgraded")
}

// --- Identity & Role Management Wrappers (Delegating to IdentityManager) ---
// These are direct pass-throughs or simple wrappers to IdentityManager,
// keeping the contract API clean.

func (s *FoodtraceSmartContract) RegisterIdentity(ctx contractapi.TransactionContextInterface, targetFullID, shortName, enrollmentID string) error {
	logger.Infof("Chaincode Call: RegisterIdentity for '%s' with alias '%s'", targetFullID, shortName)
	return NewIdentityManager(ctx).RegisterIdentity(targetFullID, shortName, enrollmentID)
}

func (s *FoodtraceSmartContract) AssignRoleToIdentity(ctx contractapi.TransactionContextInterface, identityOrAlias, role string) error {
	logger.Infof("Chaincode Call: AssignRole '%s' to '%s'", role, identityOrAlias)
	return NewIdentityManager(ctx).AssignRole(identityOrAlias, role)
}

func (s *FoodtraceSmartContract) RemoveRoleFromIdentity(ctx contractapi.TransactionContextInterface, identityOrAlias, role string) error {
	logger.Infof("Chaincode Call: RemoveRole '%s' from '%s'", role, identityOrAlias)
	return NewIdentityManager(ctx).RemoveRole(identityOrAlias, role)
}

func (s *FoodtraceSmartContract) MakeIdentityAdmin(ctx contractapi.TransactionContextInterface, identityOrAlias string) error {
	logger.Infof("Chaincode Call: MakeAdmin for '%s'", identityOrAlias)
	return NewIdentityManager(ctx).MakeAdmin(identityOrAlias)
}

func (s *FoodtraceSmartContract) RemoveIdentityAdmin(ctx contractapi.TransactionContextInterface, identityOrAlias string) error {
	logger.Infof("Chaincode Call: RemoveAdmin for '%s'", identityOrAlias)
	return NewIdentityManager(ctx).RemoveAdmin(identityOrAlias)
}

func (s *FoodtraceSmartContract) GetIdentityDetails(ctx contractapi.TransactionContextInterface, identityOrAlias string) (*model.IdentityInfo, error) {
	logger.Debugf("Chaincode Call: GetIdentityDetails for '%s'", identityOrAlias)
	im := NewIdentityManager(ctx)
	// Authorization logic is within GetIdentityDetails, but primary delegation remains.
	// This is simplified from the original as the core logic is in IdentityManager.
	// The original had specific auth logic here; this should ideally be pushed down
	// into IdentityManager.GetIdentityInfo if it's complex, or kept if it's contract-specific.
	// For this refactor, assuming the original auth logic in GetIdentityDetails from shipment_contract.go was intentional for this layer.
	isCallerAdmin, err := im.IsCurrentUserAdmin()
	if err != nil {
		return nil, fmt.Errorf("GetIdentityDetails: failed to check admin status: %w", err)
	}

	if !isCallerAdmin {
		callerFullID, err := im.GetCurrentIdentityFullID()
		if err != nil {
			return nil, fmt.Errorf("GetIdentityDetails: failed to get caller's FullID: %w", err)
		}
		targetFullID, err := im.ResolveIdentity(identityOrAlias)
		if err != nil {
			return nil, fmt.Errorf("GetIdentityDetails: failed to resolve target identity '%s': %w", identityOrAlias, err)
		}
		if callerFullID != targetFullID {
			return nil, errors.New("unauthorized: only admins or the identity owner can get these details")
		}
	}
	return im.GetIdentityInfo(identityOrAlias)
}

func (s *FoodtraceSmartContract) GetAllIdentities(ctx contractapi.TransactionContextInterface) ([]model.IdentityInfo, error) {
	logger.Debug("Chaincode Call: GetAllIdentities")
	return NewIdentityManager(ctx).GetAllRegisteredIdentities()
}

// Add this to shipment_contract.go

// GetAllAliases returns a list of all registered aliases (shortNames) in the system.
// This is a public function that doesn't require admin privileges.
// Fix for GetAllAliases (from earlier artifact)
func (s *FoodtraceSmartContract) GetAllAliases(ctx contractapi.TransactionContextInterface) ([]string, error) {
	logger.Debug("Chaincode Call: GetAllAliases (public access)")

	resultsIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("IdentityInfo", []string{})
	if err != nil {
		return nil, fmt.Errorf("GetAllAliases: failed to get identities iterator: %w", err)
	}
	defer resultsIterator.Close()

	// FIXED: Initialize as empty slice, not nil
	aliases := []string{}
	aliasSet := make(map[string]bool)

	for resultsIterator.HasNext() {
		queryResponse, iterErr := resultsIterator.Next()
		if iterErr != nil {
			logger.Warningf("GetAllAliases: Failed to get next identity from iterator: %v. Skipping.", iterErr)
			continue
		}

		var idInfo model.IdentityInfo
		if err := json.Unmarshal(queryResponse.Value, &idInfo); err != nil {
			logger.Warningf("GetAllAliases: Failed to unmarshal identity data for key '%s': %v. Skipping.", queryResponse.Key, err)
			continue
		}

		if idInfo.ShortName != "" && !aliasSet[idInfo.ShortName] {
			aliases = append(aliases, idInfo.ShortName)
			aliasSet[idInfo.ShortName] = true
		}
	}

	logger.Infof("GetAllAliases: Returning %d unique aliases", len(aliases))
	return aliases, nil // Will be [] if empty, not null
}

// Alternative: GetAllAliasesWithDetails returns alias and role info (still public)
func (s *FoodtraceSmartContract) GetAllAliasesWithDetails(ctx contractapi.TransactionContextInterface) ([]map[string]interface{}, error) {
	logger.Debug("Chaincode Call: GetAllAliasesWithDetails (public access)")

	resultsIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("IdentityInfo", []string{})
	if err != nil {
		return nil, fmt.Errorf("GetAllAliasesWithDetails: failed to get identities iterator: %w", err)
	}
	defer resultsIterator.Close()

	var aliasDetails []map[string]interface{}
	aliasSet := make(map[string]bool)

	for resultsIterator.HasNext() {
		queryResponse, iterErr := resultsIterator.Next()
		if iterErr != nil {
			logger.Warningf("GetAllAliasesWithDetails: Failed to get next identity: %v. Skipping.", iterErr)
			continue
		}

		var idInfo model.IdentityInfo
		if err := json.Unmarshal(queryResponse.Value, &idInfo); err != nil {
			logger.Warningf("GetAllAliasesWithDetails: Failed to unmarshal identity: %v. Skipping.", err)
			continue
		}

		if idInfo.ShortName != "" && !aliasSet[idInfo.ShortName] {
			aliasDetails = append(aliasDetails, map[string]interface{}{
				"alias":        idInfo.ShortName,
				"roles":        idInfo.Roles,
				"isAdmin":      idInfo.IsAdmin,
				"organization": idInfo.OrganizationMSP,
				// Don't expose FullID for privacy
			})
			aliasSet[idInfo.ShortName] = true
		}
	}

	logger.Infof("GetAllAliasesWithDetails: Returning %d unique aliases with details", len(aliasDetails))
	return aliasDetails, nil
}

// Add this to shipment_contract.go

// GetAliasesByRole returns aliases filtered by a specific role.
// This is a public function that doesn't require admin privileges.
// Fix for GetAliasesByRole (from earlier artifact)
func (s *FoodtraceSmartContract) GetAliasesByRole(ctx contractapi.TransactionContextInterface, roleFilter string) ([]string, error) {
	logger.Debugf("Chaincode Call: GetAliasesByRole for role '%s' (public access)", roleFilter)

	roleFilterLower := strings.ToLower(strings.TrimSpace(roleFilter))
	if roleFilterLower == "" {
		return nil, errors.New("roleFilter cannot be empty")
	}

	validRoles := map[string]bool{
		"farmer": true, "processor": true, "distributor": true,
		"retailer": true, "certifier": true, "admin": true,
	}
	if !validRoles[roleFilterLower] {
		return nil, fmt.Errorf("invalid role filter '%s'. Valid roles: farmer, processor, distributor, retailer, certifier, admin", roleFilter)
	}

	resultsIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("IdentityInfo", []string{})
	if err != nil {
		return nil, fmt.Errorf("GetAliasesByRole: failed to get identities iterator: %w", err)
	}
	defer resultsIterator.Close()

	// FIXED: Initialize as empty slice, not nil
	aliases := []string{}
	aliasSet := make(map[string]bool)

	for resultsIterator.HasNext() {
		queryResponse, iterErr := resultsIterator.Next()
		if iterErr != nil {
			logger.Warningf("GetAliasesByRole: Failed to get next identity from iterator: %v. Skipping.", iterErr)
			continue
		}

		var idInfo model.IdentityInfo
		if err := json.Unmarshal(queryResponse.Value, &idInfo); err != nil {
			logger.Warningf("GetAliasesByRole: Failed to unmarshal identity data for key '%s': %v. Skipping.", queryResponse.Key, err)
			continue
		}

		hasRequestedRole := false
		if roleFilterLower == "admin" {
			hasRequestedRole = idInfo.IsAdmin
		} else {
			for _, role := range idInfo.Roles {
				if strings.ToLower(role) == roleFilterLower {
					hasRequestedRole = true
					break
				}
			}
		}

		if hasRequestedRole && idInfo.ShortName != "" && !aliasSet[idInfo.ShortName] {
			aliases = append(aliases, idInfo.ShortName)
			aliasSet[idInfo.ShortName] = true
		}
	}

	logger.Infof("GetAliasesByRole: Returning %d unique aliases for role '%s'", len(aliases), roleFilter)
	return aliases, nil // Will be [] if empty, not null
}

// GetAliasesByRoleWithDetails returns detailed information about aliases filtered by role.
func (s *FoodtraceSmartContract) GetAliasesByRoleWithDetails(ctx contractapi.TransactionContextInterface, roleFilter string) ([]map[string]interface{}, error) {
	logger.Debugf("Chaincode Call: GetAliasesByRoleWithDetails for role '%s' (public access)", roleFilter)

	// Validate the role filter
	roleFilterLower := strings.ToLower(strings.TrimSpace(roleFilter))
	if roleFilterLower == "" {
		return nil, errors.New("roleFilter cannot be empty")
	}

	validRoles := map[string]bool{
		"farmer": true, "processor": true, "distributor": true,
		"retailer": true, "certifier": true, "admin": true,
	}
	if !validRoles[roleFilterLower] {
		return nil, fmt.Errorf("invalid role filter '%s'. Valid roles: farmer, processor, distributor, retailer, certifier, admin", roleFilter)
	}

	resultsIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("IdentityInfo", []string{})
	if err != nil {
		return nil, fmt.Errorf("GetAliasesByRoleWithDetails: failed to get identities iterator: %w", err)
	}
	defer resultsIterator.Close()

	var aliasDetails []map[string]interface{}
	aliasSet := make(map[string]bool)

	for resultsIterator.HasNext() {
		queryResponse, iterErr := resultsIterator.Next()
		if iterErr != nil {
			logger.Warningf("GetAliasesByRoleWithDetails: Failed to get next identity: %v. Skipping.", iterErr)
			continue
		}

		var idInfo model.IdentityInfo
		if err := json.Unmarshal(queryResponse.Value, &idInfo); err != nil {
			logger.Warningf("GetAliasesByRoleWithDetails: Failed to unmarshal identity: %v. Skipping.", err)
			continue
		}

		// Check if user has the requested role or is admin (for admin filter)
		hasRequestedRole := false
		if roleFilterLower == "admin" {
			hasRequestedRole = idInfo.IsAdmin
		} else {
			for _, role := range idInfo.Roles {
				if strings.ToLower(role) == roleFilterLower {
					hasRequestedRole = true
					break
				}
			}
		}

		if hasRequestedRole && idInfo.ShortName != "" && !aliasSet[idInfo.ShortName] {
			aliasDetails = append(aliasDetails, map[string]interface{}{
				"alias":        idInfo.ShortName,
				"roles":        idInfo.Roles,
				"isAdmin":      idInfo.IsAdmin,
				"organization": idInfo.OrganizationMSP,
				"registeredAt": idInfo.RegisteredAt.Format(time.RFC3339),
				// Don't expose FullID for privacy
			})
			aliasSet[idInfo.ShortName] = true
		}
	}

	logger.Infof("GetAliasesByRoleWithDetails: Returning %d unique aliases with details for role '%s'", len(aliasDetails), roleFilter)
	return aliasDetails, nil
}

// GetAllRolesWithCounts returns a summary of all roles and how many users have each role
func (s *FoodtraceSmartContract) GetAllRolesWithCounts(ctx contractapi.TransactionContextInterface) (map[string]interface{}, error) {
	logger.Debug("Chaincode Call: GetAllRolesWithCounts (public access)")

	resultsIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("IdentityInfo", []string{})
	if err != nil {
		return nil, fmt.Errorf("GetAllRolesWithCounts: failed to get identities iterator: %w", err)
	}
	defer resultsIterator.Close()

	roleCounts := map[string]int{
		"farmer": 0, "processor": 0, "distributor": 0,
		"retailer": 0, "certifier": 0, "admin": 0,
	}
	totalUsers := 0

	for resultsIterator.HasNext() {
		queryResponse, iterErr := resultsIterator.Next()
		if iterErr != nil {
			logger.Warningf("GetAllRolesWithCounts: Failed to get next identity: %v. Skipping.", iterErr)
			continue
		}

		var idInfo model.IdentityInfo
		if err := json.Unmarshal(queryResponse.Value, &idInfo); err != nil {
			logger.Warningf("GetAllRolesWithCounts: Failed to unmarshal identity: %v. Skipping.", err)
			continue
		}

		if idInfo.ShortName != "" { // Only count users with aliases
			totalUsers++

			// Count admin status
			if idInfo.IsAdmin {
				roleCounts["admin"]++
			}

			// Count each role
			for _, role := range idInfo.Roles {
				roleLower := strings.ToLower(role)
				if _, exists := roleCounts[roleLower]; exists {
					roleCounts[roleLower]++
				}
			}
		}
	}

	return map[string]interface{}{
		"roleCounts": roleCounts,
		"totalUsers": totalUsers,
	}, nil
}
