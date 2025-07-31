package contract

import (
	"encoding/json"
	"errors"
	"fmt"
	"foodtrace/model"
	"strconv"
	"strings"
	"time"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// --- Query Functions ---

// getShipmentByID is an internal helper to retrieve and unmarshal a shipment.
// It also ensures schema compliance.
func (s *FoodtraceSmartContract) getShipmentByID(ctx contractapi.TransactionContextInterface, shipmentID string) (*model.Shipment, error) {
	if strings.TrimSpace(shipmentID) == "" {
		return nil, errors.New("getShipmentByID: shipmentID cannot be empty")
	}
	shipmentKey, err := s.createShipmentCompositeKey(ctx, shipmentID)
	if err != nil {
		return nil, fmt.Errorf("getShipmentByID: failed to create key for shipment '%s': %w", shipmentID, err)
	}

	shipmentBytes, err := ctx.GetStub().GetState(shipmentKey)
	if err != nil {
		return nil, fmt.Errorf("getShipmentByID: failed to read shipment '%s' from ledger: %w", shipmentID, err)
	}
	if shipmentBytes == nil {
		return nil, fmt.Errorf("shipment with ID '%s' does not exist", shipmentID)
	}

	var shipment model.Shipment
	if err = json.Unmarshal(shipmentBytes, &shipment); err != nil {
		return nil, fmt.Errorf("getShipmentByID: failed to unmarshal shipment '%s' data: %w", shipmentID, err)
	}

	ensureShipmentSchemaCompliance(&shipment) // Ensure all sub-structs are initialized
	return &shipment, nil
}

// Fix for GetShipmentPublicDetails in shipment_query_ops.go
func (s *FoodtraceSmartContract) GetShipmentPublicDetails(ctx contractapi.TransactionContextInterface, shipmentID string) (*model.Shipment, error) {
	logger.Debugf("GetShipmentPublicDetails: Querying details for shipment '%s'", shipmentID)
	if err := s.validateRequiredString(shipmentID, "shipmentID", maxStringInputLength); err != nil {
		return nil, err
	}

	im := NewIdentityManager(ctx)
	shipment, err := s.getShipmentByID(ctx, shipmentID)
	if err != nil {
		return nil, err
	}

	s.enrichShipmentAliases(im, shipment)

	shipmentKey, keyErr := s.createShipmentCompositeKey(ctx, shipmentID)
	if keyErr != nil {
		logger.Warningf("GetShipmentPublicDetails: Failed to create shipment key for history query on shipment '%s': %v. Details returned without history.", shipmentID, keyErr)
		// FIXED: Initialize empty history if can't get history
		shipment.History = []model.HistoryEntry{}
	} else {
		historyIter, errHist := ctx.GetStub().GetHistoryForKey(shipmentKey)
		if errHist != nil {
			logger.Warningf("GetShipmentPublicDetails: Failed to get history for shipment '%s': %v. Details returned without history.", shipmentID, errHist)
			// FIXED: Initialize empty history if can't get history
			shipment.History = []model.HistoryEntry{}
		} else {
			defer historyIter.Close()
			// FIXED: Initialize as empty slice, not nil
			historyEntries := []model.HistoryEntry{}

			for historyIter.HasNext() {
				historyItem, iterErr := historyIter.Next()
				if iterErr != nil {
					logger.Warningf("GetShipmentPublicDetails: Error iterating shipment history for '%s': %v. Skipping entry.", shipmentID, iterErr)
					continue
				}
				var pastShipmentState model.Shipment
				_ = json.Unmarshal(historyItem.Value, &pastShipmentState)

				actorIDForHistory := pastShipmentState.CurrentOwnerID
				actorAliasForHistory := pastShipmentState.CurrentOwnerAlias

				if actorAliasForHistory == "" && actorIDForHistory != "" {
					actorInfo, _ := im.GetIdentityInfo(actorIDForHistory)
					if actorInfo != nil {
						actorAliasForHistory = actorInfo.ShortName
					}
				}
				action := string(pastShipmentState.Status)
				if historyItem.IsDelete {
					action = "DELETED"
				}

				entry := model.HistoryEntry{
					TxID:       historyItem.TxId,
					Timestamp:  historyItem.Timestamp.AsTime(),
					IsDelete:   historyItem.IsDelete,
					Value:      string(historyItem.Value),
					ActorID:    actorIDForHistory,
					ActorAlias: actorAliasForHistory,
					Action:     action,
				}
				historyEntries = append(historyEntries, entry)
			}
			shipment.History = historyEntries // Will be [] if no history, not null
		}
	}
	return shipment, nil
}

// Fix for GetMyShipments in shipment_query_ops.go
func (s *FoodtraceSmartContract) GetMyShipments(ctx contractapi.TransactionContextInterface, pageSizeStr string, bookmark string) (*model.PaginatedShipmentResponse, error) {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("GetMyShipments: failed to get actor info: %w", err)
	}

	pageSize, err := strconv.ParseInt(pageSizeStr, 10, 32)
	if err != nil || pageSize <= 0 {
		logger.Warningf("GetMyShipments: Invalid pageSize '%s', using default of 10. Error: %v", pageSizeStr, err)
		pageSize = 10
	}
	if pageSize > 100 {
		logger.Warningf("GetMyShipments: Requested pageSize %d exceeds max of 100. Capping at 100.", pageSize)
		pageSize = 100
	}

	logger.Infof("GetMyShipments: Getting non-archived shipments for current owner: %s (alias: %s) with pageSize: %d, bookmark: '%s'", actor.fullID, actor.alias, pageSize, bookmark)
	im := NewIdentityManager(ctx)

	queryString := fmt.Sprintf(`{"selector":{"objectType":"%s", "currentOwnerId":"%s", "isArchived":false}, "use_index":"_design/indexObjectTypeOwnerIsArchivedDoc"}`, shipmentObjectType, actor.fullID)

	resultsIterator, metadata, err := ctx.GetStub().GetQueryResultWithPagination(queryString, int32(pageSize), bookmark)
	if err != nil {
		logger.Warningf("GetMyShipments: CouchDB GetQueryResultWithPagination for user '%s' failed: %v. Falling back to full scan (SLOW).", actor.fullID, err)

		allResultsIterator, metadataFallback, errScan := ctx.GetStub().GetStateByPartialCompositeKeyWithPagination(shipmentObjectType, []string{}, int32(pageSize), bookmark)
		if errScan != nil {
			return nil, fmt.Errorf("GetMyShipments: CouchDB query failed (%v) and LevelDB paginated scan also failed (%w)", err, errScan)
		}
		defer allResultsIterator.Close()

		// FIXED: Initialize as empty slice, not nil
		myFilteredShipments := []*model.Shipment{}
		var actualFetchedCount int32 = 0

		for allResultsIterator.HasNext() {
			queryResponse, iterErr := allResultsIterator.Next()
			if iterErr != nil {
				logger.Warningf("GetMyShipments fallback: Error iterating results: %v. Skipping.", iterErr)
				continue
			}

			var ship model.Shipment
			if err := json.Unmarshal(queryResponse.Value, &ship); err != nil {
				logger.Warningf("GetMyShipments fallback: Error unmarshalling shipment: %v. Skipping.", err)
				continue
			}

			if ship.CurrentOwnerID == actor.fullID && !ship.IsArchived {
				ensureShipmentSchemaCompliance(&ship)
				s.enrichShipmentAliases(im, &ship)
				ship.History = []model.HistoryEntry{} // FIXED: Initialize as empty slice
				myFilteredShipments = append(myFilteredShipments, &ship)
				actualFetchedCount++
			}
		}

		return &model.PaginatedShipmentResponse{
			Shipments:    myFilteredShipments, // Will be [] if empty, not null
			NextBookmark: metadataFallback.GetBookmark(),
			FetchedCount: actualFetchedCount,
		}, errors.New("GetMyShipments: Fallback logic triggered, potentially incomplete or slow results. Ensure CouchDB index 'indexObjectTypeOwnerIsArchivedDoc' exists")
	}
	defer resultsIterator.Close()

	// FIXED: Initialize as empty slice, not nil
	shipmentsFromQuery := []*model.Shipment{}
	var fetchedCountCouchDB int32 = 0

	for resultsIterator.HasNext() {
		queryResponse, iterErr := resultsIterator.Next()
		if iterErr != nil {
			logger.Warningf("GetMyShipments: Error iterating CouchDB results: %v. Skipping.", iterErr)
			continue
		}
		var ship model.Shipment
		if errUnmarshal := json.Unmarshal(queryResponse.Value, &ship); errUnmarshal != nil {
			logger.Warningf("GetMyShipments: Error unmarshalling shipment: %v. Skipping.", errUnmarshal)
			continue
		}
		ensureShipmentSchemaCompliance(&ship)
		s.enrichShipmentAliases(im, &ship)
		ship.History = []model.HistoryEntry{} // FIXED: Initialize as empty slice
		shipmentsFromQuery = append(shipmentsFromQuery, &ship)
		fetchedCountCouchDB++
	}

	logger.Infof("GetMyShipments (CouchDB): Found %d non-archived shipments for user '%s' on this page.", fetchedCountCouchDB, actor.alias)
	return &model.PaginatedShipmentResponse{
		Shipments:    shipmentsFromQuery, // Will be [] if empty, not null
		NextBookmark: metadata.GetBookmark(),
		FetchedCount: fetchedCountCouchDB,
	}, nil
}

// Fix for GetAllShipments in shipment_query_ops.go
func (s *FoodtraceSmartContract) GetAllShipments(ctx contractapi.TransactionContextInterface, pageSizeStr string, bookmark string) (*model.PaginatedShipmentResponse, error) {
	im := NewIdentityManager(ctx)
	pageSize, err := strconv.ParseInt(pageSizeStr, 10, 32)
	if err != nil || pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}
	logger.Infof("GetAllShipments: Admin getting all non-archived shipments (pageSize: %d, bookmark: '%s')", pageSize, bookmark)

	resultsIterator, metadata, err := ctx.GetStub().GetStateByPartialCompositeKeyWithPagination(shipmentObjectType, []string{}, int32(pageSize), bookmark)
	if err != nil {
		return nil, fmt.Errorf("GetAllShipments: failed to get shipments iterator: %w", err)
	}
	defer resultsIterator.Close()

	// FIXED: Initialize as empty slice, not nil
	shipments := []*model.Shipment{}
	fetchedCount := int32(0)

	for resultsIterator.HasNext() {
		queryResponse, iterErr := resultsIterator.Next()
		if iterErr != nil {
			logger.Warningf("GetAllShipments: Error iterating results: %v. Skipping.", iterErr)
			continue
		}
		var ship model.Shipment
		if errUnmarshal := json.Unmarshal(queryResponse.Value, &ship); errUnmarshal != nil {
			logger.Warningf("GetAllShipments: Error unmarshalling shipment: %v. Skipping.", errUnmarshal)
			continue
		}
		if !ship.IsArchived {
			ensureShipmentSchemaCompliance(&ship)
			s.enrichShipmentAliases(im, &ship)
			ship.History = []model.HistoryEntry{} // FIXED: Initialize as empty slice
			shipments = append(shipments, &ship)
			fetchedCount++
		}
	}

	logger.Infof("GetAllShipments: Retrieved %d non-archived shipments for this page.", fetchedCount)
	return &model.PaginatedShipmentResponse{
		Shipments:    shipments, // Will be [] if empty, not null
		NextBookmark: metadata.GetBookmark(),
		FetchedCount: fetchedCount,
	}, nil
}

// Fix for GetShipmentsByStatus in shipment_query_ops.go
func (s *FoodtraceSmartContract) GetShipmentsByStatus(ctx contractapi.TransactionContextInterface, statusToQuery string, pageSizeStr string, bookmark string) (*model.PaginatedShipmentResponse, error) {
	logger.Infof("GetShipmentsByStatus: Querying shipments with status '%s', pageSize: '%s', bookmark: '%s'", statusToQuery, pageSizeStr, bookmark)
	var targetStatus model.ShipmentStatus

	switch strings.ToUpper(statusToQuery) {
	case string(model.StatusCreated):
		targetStatus = model.StatusCreated
	case string(model.StatusPendingCertification):
		targetStatus = model.StatusPendingCertification
	case string(model.StatusCertified):
		targetStatus = model.StatusCertified
	case string(model.StatusCertificationRejected):
		targetStatus = model.StatusCertificationRejected
	case string(model.StatusProcessed):
		targetStatus = model.StatusProcessed
	case string(model.StatusDistributed):
		targetStatus = model.StatusDistributed
	case string(model.StatusDelivered):
		targetStatus = model.StatusDelivered
	case string(model.StatusConsumed):
		targetStatus = model.StatusConsumed
	case string(model.StatusRecalled):
		targetStatus = model.StatusRecalled
	case string(model.StatusConsumedInProcessing):
		targetStatus = model.StatusConsumedInProcessing
	default:
		return nil, fmt.Errorf("invalid statusToQuery: '%s'", statusToQuery)
	}

	im := NewIdentityManager(ctx)
	// NOTE: Authorization removed per previous discussion - now open access

	pageSize, err := strconv.ParseInt(pageSizeStr, 10, 32)
	if err != nil || pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}

	queryString := fmt.Sprintf(`{"selector":{"objectType":"%s", "status":"%s", "isArchived":false}, "use_index":"_design/indexObjectTypeStatusIsArchivedDoc"}`, shipmentObjectType, targetStatus)
	resultsIterator, metadata, err := ctx.GetStub().GetQueryResultWithPagination(queryString, int32(pageSize), bookmark)
	if err != nil {
		return nil, fmt.Errorf("GetShipmentsByStatus: CouchDB query failed for status '%s': %w. Ensure index 'indexObjectTypeStatusIsArchivedDoc' exists", targetStatus, err)
	}
	defer resultsIterator.Close()

	// FIXED: Initialize as empty slice, not nil
	shipmentsFromQuery := []*model.Shipment{}
	fetchedCountCouchDB := int32(0)

	for resultsIterator.HasNext() {
		queryResponse, iterErr := resultsIterator.Next()
		if iterErr != nil {
			logger.Warningf("GetShipmentsByStatus: Error iterating CouchDB results: %v. Skipping.", iterErr)
			continue
		}
		var ship model.Shipment
		if errUnmarshal := json.Unmarshal(queryResponse.Value, &ship); errUnmarshal != nil {
			logger.Warningf("GetShipmentsByStatus: Error unmarshalling shipment: %v. Skipping.", errUnmarshal)
			continue
		}
		ensureShipmentSchemaCompliance(&ship)
		s.enrichShipmentAliases(im, &ship)
		ship.History = []model.HistoryEntry{} // FIXED: Initialize as empty slice
		shipmentsFromQuery = append(shipmentsFromQuery, &ship)
		fetchedCountCouchDB++
	}

	logger.Infof("GetShipmentsByStatus (CouchDB): Found %d non-archived shipments with status '%s' on this page.", fetchedCountCouchDB, targetStatus)
	return &model.PaginatedShipmentResponse{
		Shipments:    shipmentsFromQuery, // Will be [] if empty, not null
		NextBookmark: metadata.GetBookmark(),
		FetchedCount: fetchedCountCouchDB,
	}, nil
}

// Fix for QueryRelatedShipments in shipment_query_ops.go
func (s *FoodtraceSmartContract) QueryRelatedShipments(ctx contractapi.TransactionContextInterface, recalledShipmentID string, timeWindowHoursStr string) ([]model.RelatedShipmentInfo, error) {
	im := NewIdentityManager(ctx)
	if err := s.requireAdmin(ctx, im); err != nil {
		return nil, fmt.Errorf("QueryRelatedShipments: %w", err)
	}

	if err := s.validateRequiredString(recalledShipmentID, "recalledShipmentID", maxStringInputLength); err != nil {
		return nil, err
	}
	logger.Infof("Querying related shipments for recalled shipment '%s', window: '%s' hours", recalledShipmentID, timeWindowHoursStr)

	timeWindowHours, err := strconv.Atoi(timeWindowHoursStr)
	if err != nil || timeWindowHours <= 0 || timeWindowHours > 720 {
		logger.Warningf("Invalid or out-of-range timeWindowHours '%s', using default %d hours. Error: %v", timeWindowHoursStr, defaultRecallQueryHours, err)
		timeWindowHours = defaultRecallQueryHours
	}
	timeWindow := time.Duration(timeWindowHours) * time.Hour

	rShip, err := s.getShipmentByID(ctx, recalledShipmentID)
	if err != nil {
		return nil, fmt.Errorf("QueryRelatedShipments: recalled shipment '%s' not found: %w", recalledShipmentID, err)
	}

	// FIXED: Initialize as empty slice, not nil
	relatedShipments := []model.RelatedShipmentInfo{}

	resultsIterator, err := ctx.GetStub().GetStateByPartialCompositeKey(shipmentObjectType, []string{})
	if err != nil {
		return nil, fmt.Errorf("QueryRelatedShipments: failed to get shipment iterator: %w", err)
	}
	defer resultsIterator.Close()

	for resultsIterator.HasNext() {
		resp, iterErr := resultsIterator.Next()
		if iterErr != nil {
			logger.Warningf("QueryRelatedShipments: Error iterating results: %v. Skipping.", iterErr)
			continue
		}
		var oShip model.Shipment
		if err := json.Unmarshal(resp.Value, &oShip); err != nil {
			logger.Warningf("QueryRelatedShipments: Error unmarshalling shipment: %v. Skipping.", err)
			continue
		}
		ensureShipmentSchemaCompliance(&oShip)
		s.enrichShipmentAliases(im, &oShip)

		if oShip.ID == recalledShipmentID {
			continue
		}
		if rShip.RecallInfo.IsRecalled && rShip.RecallInfo.RecallID != "" &&
			oShip.RecallInfo.IsRecalled && oShip.RecallInfo.RecallID == rShip.RecallInfo.RecallID {
			continue
		}

		// Check ProcessorData linkage
		if rShip.ProcessorData != nil && oShip.ProcessorData != nil &&
			rShip.ProcessorData.ProcessorID == oShip.ProcessorData.ProcessorID &&
			rShip.ProcessorData.ProcessingLineID == oShip.ProcessorData.ProcessingLineID {
			if !rShip.ProcessorData.DateProcessed.IsZero() && !oShip.ProcessorData.DateProcessed.IsZero() {
				if timeDiff := rShip.ProcessorData.DateProcessed.Sub(oShip.ProcessorData.DateProcessed); AbsDuration(timeDiff) <= timeWindow {
					relatedShipments = append(relatedShipments, model.RelatedShipmentInfo{
						ShipmentID:        oShip.ID,
						ProductName:       oShip.ProductName,
						Status:            oShip.Status,
						CurrentOwnerID:    oShip.CurrentOwnerID,
						CurrentOwnerAlias: oShip.CurrentOwnerAlias,
						RelationReason:    "Same processing line within time window",
						ActorID:           oShip.ProcessorData.ProcessorID,
						ActorAlias:        oShip.ProcessorData.ProcessorAlias,
						LineID:            oShip.ProcessorData.ProcessingLineID,
						EventTimestamp:    oShip.ProcessorData.DateProcessed,
					})
					continue
				}
			}
		}

		// Check DistributorData linkage
		if rShip.DistributorData != nil && oShip.DistributorData != nil &&
			rShip.DistributorData.DistributorID == oShip.DistributorData.DistributorID &&
			rShip.DistributorData.DistributionLineID == oShip.DistributorData.DistributionLineID {
			if !rShip.DistributorData.PickupDateTime.IsZero() && !oShip.DistributorData.PickupDateTime.IsZero() {
				if timeDiff := rShip.DistributorData.PickupDateTime.Sub(oShip.DistributorData.PickupDateTime); AbsDuration(timeDiff) <= timeWindow {
					relatedShipments = append(relatedShipments, model.RelatedShipmentInfo{
						ShipmentID:        oShip.ID,
						ProductName:       oShip.ProductName,
						Status:            oShip.Status,
						CurrentOwnerID:    oShip.CurrentOwnerID,
						CurrentOwnerAlias: oShip.CurrentOwnerAlias,
						RelationReason:    "Same distribution line within time window",
						ActorID:           oShip.DistributorData.DistributorID,
						ActorAlias:        oShip.DistributorData.DistributorAlias,
						LineID:            oShip.DistributorData.DistributionLineID,
						EventTimestamp:    oShip.DistributorData.PickupDateTime,
					})
					continue
				}
			}
		}

		// Check FarmerData linkage
		if rShip.FarmerData != nil && oShip.FarmerData != nil &&
			rShip.FarmerData.FarmerID == oShip.FarmerData.FarmerID &&
			rShip.FarmerData.FarmLocation == oShip.FarmerData.FarmLocation {
			if !rShip.FarmerData.HarvestDate.IsZero() && !oShip.FarmerData.HarvestDate.IsZero() {
				if timeDiff := rShip.FarmerData.HarvestDate.Sub(oShip.FarmerData.HarvestDate); AbsDuration(timeDiff) <= timeWindow {
					relatedShipments = append(relatedShipments, model.RelatedShipmentInfo{
						ShipmentID:        oShip.ID,
						ProductName:       oShip.ProductName,
						Status:            oShip.Status,
						CurrentOwnerID:    oShip.CurrentOwnerID,
						CurrentOwnerAlias: oShip.CurrentOwnerAlias,
						RelationReason:    "Same farm and harvest period",
						ActorID:           oShip.FarmerData.FarmerID,
						ActorAlias:        oShip.FarmerData.FarmerAlias,
						LineID:            "",
						EventTimestamp:    oShip.FarmerData.HarvestDate,
					})
					continue
				}
			}
		}
	}
	logger.Infof("QueryRelatedShipments: Found %d potentially related shipments for recalled shipment '%s'", len(relatedShipments), recalledShipmentID)
	return relatedShipments, nil // Will be [] if empty, not null
}

// Fix for processShipmentIterator in shipment_query_ops.go
func (s *FoodtraceSmartContract) processShipmentIterator(ctx contractapi.TransactionContextInterface, iterator shim.StateQueryIteratorInterface, enrichAliases bool) ([]*model.Shipment, error) {
	// FIXED: Initialize as empty slice, not nil
	shipments := []*model.Shipment{}
	im := NewIdentityManager(ctx)

	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			logger.Warningf("processShipmentIterator: Error getting next item from iterator: %v. Skipping.", err)
			continue
		}
		var ship model.Shipment
		if err = json.Unmarshal(queryResponse.Value, &ship); err != nil {
			logger.Warningf("processShipmentIterator: Error unmarshalling shipment from iterator (key: %s): %v. Skipping.", queryResponse.Key, err)
			continue
		}
		ensureShipmentSchemaCompliance(&ship)
		if enrichAliases {
			s.enrichShipmentAliases(im, &ship)
		}
		shipments = append(shipments, &ship)
	}
	return shipments, nil // Will be [] if empty, not null
}

// Fix for GetMyActionableShipments (from earlier artifact)
func (s *FoodtraceSmartContract) GetMyActionableShipments(ctx contractapi.TransactionContextInterface, pageSizeStr string, bookmark string) (*model.PaginatedShipmentResponse, error) {
	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("GetMyActionableShipments: failed to get actor info: %w", err)
	}

	im := NewIdentityManager(ctx)
	isCallerAdmin, _ := im.IsCurrentUserAdmin()
	// FIXED: Initialize as empty slice, not nil
	userRoles := []string{}

	if !isCallerAdmin {
		idInfo, err := im.GetIdentityInfo(actor.fullID)
		if err != nil {
			return nil, fmt.Errorf("GetMyActionableShipments: failed to get caller's identity info: %w", err)
		}
		userRoles = idInfo.Roles
	}

	pageSize, err := strconv.ParseInt(pageSizeStr, 10, 32)
	if err != nil || pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}

	logger.Infof("GetMyActionableShipments: Getting actionable shipments for '%s' (alias: %s) with roles: %v, admin: %v",
		actor.fullID, actor.alias, userRoles, isCallerAdmin)

	resultsIterator, metadata, err := ctx.GetStub().GetStateByPartialCompositeKeyWithPagination(shipmentObjectType, []string{}, int32(pageSize*3), bookmark)
	if err != nil {
		return nil, fmt.Errorf("GetMyActionableShipments: failed to get shipments iterator: %w", err)
	}
	defer resultsIterator.Close()

	// FIXED: Initialize as empty slice, not nil
	actionableShipments := []*model.Shipment{}
	fetchedCount := int32(0)
	totalScanned := 0

	for resultsIterator.HasNext() && fetchedCount < int32(pageSize) {
		queryResponse, iterErr := resultsIterator.Next()
		if iterErr != nil {
			logger.Warningf("GetMyActionableShipments: Error iterating results: %v. Skipping.", iterErr)
			continue
		}

		totalScanned++
		var ship model.Shipment
		if errUnmarshal := json.Unmarshal(queryResponse.Value, &ship); errUnmarshal != nil {
			logger.Warningf("GetMyActionableShipments: Error unmarshalling shipment: %v. Skipping.", errUnmarshal)
			continue
		}

		if ship.IsArchived || (ship.RecallInfo != nil && ship.RecallInfo.IsRecalled) {
			continue
		}

		canAct, actionType := s.canUserActOnShipment(&ship, actor.fullID, userRoles, isCallerAdmin)
		if canAct {
			ensureShipmentSchemaCompliance(&ship)
			s.enrichShipmentAliases(im, &ship)
			ship.History = []model.HistoryEntry{} // FIXED: Initialize as empty slice

			actionableShipments = append(actionableShipments, &ship)
			fetchedCount++

			logger.Debugf("GetMyActionableShipments: Shipment '%s' actionable by '%s' - Action: %s",
				ship.ID, actor.alias, actionType)
		}
	}

	logger.Infof("GetMyActionableShipments: Found %d actionable shipments for '%s' (scanned %d total)",
		fetchedCount, actor.alias, totalScanned)

	return &model.PaginatedShipmentResponse{
		Shipments:    actionableShipments, // Will be [] if empty, not null
		NextBookmark: metadata.GetBookmark(),
		FetchedCount: fetchedCount,
	}, nil
}

// Helper function to determine if a user can act on a shipment
func (s *FoodtraceSmartContract) canUserActOnShipment(shipment *model.Shipment, userFullID string, userRoles []string, isAdmin bool) (bool, string) {
	// Admins can act on any shipment
	if isAdmin {
		return true, "ADMIN_ACTION"
	}

	// Check role-based actions
	hasRole := func(role string) bool {
		for _, r := range userRoles {
			if r == role {
				return true
			}
		}
		return false
	}

	switch shipment.Status {
	case model.StatusCreated:
		// Farmers can submit their own shipments for certification
		if shipment.CurrentOwnerID == userFullID && hasRole("farmer") {
			return true, "SUBMIT_FOR_CERTIFICATION"
		}

		// Processors can process shipments designated for them
		if shipment.FarmerData != nil && shipment.FarmerData.DestinationProcessorID == userFullID && hasRole("processor") {
			return true, "PROCESS_SHIPMENT"
		}

	case model.StatusPendingCertification:
		// Any certifier can certify any pending shipment
		if hasRole("certifier") {
			return true, "RECORD_CERTIFICATION"
		}

	case model.StatusCertified:
		// Processors can process certified shipments designated for them
		if shipment.FarmerData != nil && shipment.FarmerData.DestinationProcessorID == userFullID && hasRole("processor") {
			return true, "PROCESS_SHIPMENT"
		}

	case model.StatusProcessed:
		// Distributors can distribute shipments designated for them
		if shipment.ProcessorData != nil && shipment.ProcessorData.DestinationDistributorID == userFullID && hasRole("distributor") {
			return true, "DISTRIBUTE_SHIPMENT"
		}

	case model.StatusDistributed:
		// Retailers can receive shipments designated for them
		if shipment.DistributorData != nil && shipment.DistributorData.DestinationRetailerID == userFullID && hasRole("retailer") {
			return true, "RECEIVE_SHIPMENT"
		}

	case model.StatusDelivered:
		// Current owner (retailer) can mark as consumed
		if shipment.CurrentOwnerID == userFullID && hasRole("retailer") {
			return true, "MARK_CONSUMED"
		}

		// Processors can use delivered shipments in transformations if they own them
		if shipment.CurrentOwnerID == userFullID && hasRole("processor") {
			return true, "USE_IN_TRANSFORMATION"
		}

	case model.StatusRecalled:
		// No actions typically allowed on recalled shipments
		return false, ""

	case model.StatusConsumed, model.StatusConsumedInProcessing:
		// No further actions on consumed shipments
		return false, ""

	case model.StatusCertificationRejected:
		// Owner might be able to resubmit or take corrective action
		if shipment.CurrentOwnerID == userFullID {
			return true, "RESUBMIT_OR_CORRECT"
		}
	}

	// Check if user can initiate recall (current owner can recall)
	if shipment.CurrentOwnerID == userFullID {
		return true, "INITIATE_RECALL"
	}

	return false, ""
}

// Alternative function that returns actionable shipments with action metadata
func (s *FoodtraceSmartContract) GetMyActionableShipmentsWithActions(ctx contractapi.TransactionContextInterface, pageSizeStr string, bookmark string) (map[string]interface{}, error) {
	result, err := s.GetMyActionableShipments(ctx, pageSizeStr, bookmark)
	if err != nil {
		return nil, err
	}

	actor, err := s.getCurrentActorInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("GetMyActionableShipmentsWithActions: failed to get actor info: %w", err)
	}

	im := NewIdentityManager(ctx)
	isCallerAdmin, _ := im.IsCurrentUserAdmin()
	userRoles := []string{}

	if !isCallerAdmin {
		idInfo, err := im.GetIdentityInfo(actor.fullID)
		if err == nil && idInfo != nil {
			userRoles = idInfo.Roles
		}
	}

	// Add action information to each shipment
	shipmentsWithActions := make([]map[string]interface{}, len(result.Shipments))
	for i, shipment := range result.Shipments {
		_, actionType := s.canUserActOnShipment(shipment, actor.fullID, userRoles, isCallerAdmin)

		shipmentsWithActions[i] = map[string]interface{}{
			"shipment":   shipment,
			"actionType": actionType,
			"canAct":     true, // All shipments in this result are actionable
		}
	}

	return map[string]interface{}{
		"shipments":    shipmentsWithActions,
		"nextBookmark": result.NextBookmark,
		"fetchedCount": result.FetchedCount,
		"userInfo": map[string]interface{}{
			"fullId":  actor.fullID,
			"alias":   actor.alias,
			"roles":   userRoles,
			"isAdmin": isCallerAdmin,
		},
	}, nil
}
