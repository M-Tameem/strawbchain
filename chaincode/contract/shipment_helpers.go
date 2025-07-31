package contract

import (
	"encoding/json"
	"errors"
	"fmt"
	"foodtrace/model"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// --- Core Helper Methods (used across multiple operations) ---

// getCurrentTxTimestamp retrieves the current transaction timestamp from the stub.
func (s *FoodtraceSmartContract) getCurrentTxTimestamp(ctx contractapi.TransactionContextInterface) (time.Time, error) {
	ts, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return time.Time{}, fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	return ts.AsTime(), nil
}

// FIXED: Improved getCurrentActorInfo to handle test scenarios better
func (s *FoodtraceSmartContract) getCurrentActorInfo(ctx contractapi.TransactionContextInterface) (*actorInfo, error) {
	im := NewIdentityManager(ctx)
	fullID, err := im.GetCurrentIdentityFullID()
	if err != nil {
		return nil, fmt.Errorf("failed to get current actor's FullID: %w", err)
	}

	var alias string
	idInfo, errGetInfo := im.GetIdentityInfo(fullID)
	if errGetInfo == nil && idInfo != nil {
		alias = idInfo.ShortName
	} else {
		logger.Debugf("Could not retrieve IdentityInfo (or alias) for actor %s: %v. Attempting fallback.", fullID, errGetInfo)

		// FIXED: Try to extract alias from X.509 CN if it follows our test pattern
		if strings.Contains(fullID, "::CN=") {
			parts := strings.Split(fullID, "::CN=")
			if len(parts) > 1 {
				cnPart := parts[1]
				// Remove any additional suffixes
				if idx := strings.Index(cnPart, "::"); idx != -1 {
					cnPart = cnPart[:idx]
				}
				alias = cnPart
				logger.Debugf("Extracted alias '%s' from fullID CN field", alias)
			}
		}

		// Fallback to enrollment ID
		if alias == "" {
			enrollmentID, enrollErr := im.GetCurrentEnrollmentID()
			if enrollErr == nil && enrollmentID != "" {
				alias = enrollmentID
			} else {
				logger.Warningf("Failed to get EnrollmentID for %s (EnrollErr: %v, GetInfoErr: %v). Using placeholder alias.", fullID, enrollErr, errGetInfo)
				// Truncate fullID for alias placeholder to avoid overly long alias
				maxAliasLen := 16
				if len(fullID) > maxAliasLen {
					alias = "unknown_" + fullID[:maxAliasLen]
				} else {
					alias = "unknown_" + fullID
				}
			}
		}
	}

	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return nil, fmt.Errorf("failed to get current actor's MSPID: %w", err)
	}
	return &actorInfo{fullID: fullID, alias: alias, mspID: mspID}, nil
}

// createShipmentCompositeKey creates a composite key for a shipment.
func (s *FoodtraceSmartContract) createShipmentCompositeKey(ctx contractapi.TransactionContextInterface, shipmentID string) (string, error) {
	shipmentID = strings.TrimSpace(shipmentID)
	if shipmentID == "" {
		return "", errors.New("shipmentID cannot be empty")
	}
	return ctx.GetStub().CreateCompositeKey(shipmentObjectType, []string{shipmentID})
}

// --- Validation Helper Functions ---
func (s *FoodtraceSmartContract) validateRequiredString(input, field string, max int) error {
	if strings.TrimSpace(input) == "" {
		return fmt.Errorf("%s cannot be empty", field)
	}
	if len(input) > max {
		return fmt.Errorf("%s exceeds max length %d", field, max)
	}
	return nil
}

func (s *FoodtraceSmartContract) validateOptionalString(input, field string, max int) error {
	if input != "" && len(input) > max {
		return fmt.Errorf("%s exceeds max length %d", field, max)
	}
	return nil
}

func (s *FoodtraceSmartContract) validateStringArray(arr []string, field string, maxItems, maxItemLen int) error {
	if arr == nil { // nil array is valid (empty)
		return nil
	}
	if len(arr) > maxItems {
		return fmt.Errorf("%s has %d items, exceeding maximum of %d", field, len(arr), maxItems)
	}
	for i, v := range arr {
		// Treat items in array as optional strings unless specific validation is needed for emptiness
		if err := s.validateOptionalString(v, fmt.Sprintf("%s[%d]", field, i), maxItemLen); err != nil {
			return err
		}
	}
	return nil
}

func (s *FoodtraceSmartContract) validateGeoPoint(gp *model.GeoPoint, field string, required bool) error {
	if gp == nil {
		if required {
			return fmt.Errorf("%s is required", field)
		}
		return nil
	}
	if gp.Latitude < -90 || gp.Latitude > 90 {
		return fmt.Errorf("%s.latitude must be between -90 and 90", field)
	}
	if gp.Longitude < -180 || gp.Longitude > 180 {
		return fmt.Errorf("%s.longitude must be between -180 and 180", field)
	}
	return nil
}

func (s *FoodtraceSmartContract) validateGeoPointArray(gps []model.GeoPoint, field string, maxItems int) error {
	if gps == nil {
		return nil
	}
	if len(gps) > maxItems {
		return fmt.Errorf("%s has %d items, exceeding maximum of %d", field, len(gps), maxItems)
	}
	for i := range gps {
		if err := s.validateGeoPoint(&gps[i], fmt.Sprintf("%s[%d]", field, i), false); err != nil {
			return err
		}
	}
	return nil
}

func parseDateString(str, field string, required bool) (time.Time, error) {
	sTrimmed := strings.TrimSpace(str)
	if sTrimmed == "" {
		if required {
			return time.Time{}, fmt.Errorf("%s is a required date field and cannot be empty", field)
		}
		return time.Time{}, nil // Return zero time if optional and empty
	}
	t, err := time.Parse(time.RFC3339, sTrimmed)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid format for %s (expected RFC3339 'YYYY-MM-DDTHH:MM:SSZ'): %w", field, err)
	}
	return t, nil
}

// Specific data args validators
type ValidatedFarmerData struct { // To return parsed dates
	FarmerName                string          `json:"farmerName"`
	FarmLocation              string          `json:"farmLocation"`
	FarmCoordinates           *model.GeoPoint `json:"farmCoordinates"`
	CropType                  string          `json:"cropType"`
	PlantingDate              time.Time
	FertilizerUsed            string `json:"fertilizerUsed"`
	CertificationDocumentHash string `json:"certificationDocumentHash"`
	HarvestDate               time.Time
	FarmingPractice           string `json:"farmingPractice"`
	BedType                   string `json:"bedType"`
	IrrigationMethod          string `json:"irrigationMethod"`
	OrganicSince              time.Time
	BufferZoneMeters          float64  `json:"bufferZoneMeters"`
	DestinationProcessorID    string   `json:"destinationProcessorId"`
	PestFreeConfirmation      bool     `json:"pestFreeConfirmation"`
	PestsFound                []string `json:"pestsFound"`
	PestTreatmentActions      string   `json:"pestTreatmentActions"`
}

func (s *FoodtraceSmartContract) validateFarmerDataArgs(ctx contractapi.TransactionContextInterface, farmerDataJSON string) (*ValidatedFarmerData, error) {
	var fdArg struct { // Temporary struct for unmarshalling string dates
		FarmerName                string          `json:"farmerName"`
		FarmLocation              string          `json:"farmLocation"`
		FarmCoordinates           *model.GeoPoint `json:"farmCoordinates"`
		CropType                  string          `json:"cropType"`
		PlantingDateStr           string          `json:"plantingDate"`
		FertilizerUsed            string          `json:"fertilizerUsed"`
		CertificationDocumentHash string          `json:"certificationDocumentHash"`
		HarvestDateStr            string          `json:"harvestDate"`
		FarmingPractice           string          `json:"farmingPractice"`
		BedType                   string          `json:"bedType"`
		IrrigationMethod          string          `json:"irrigationMethod"`
		OrganicSinceStr           string          `json:"organicSince"`
		BufferZoneMeters          float64         `json:"bufferZoneMeters"`
		DestinationProcessorID    string          `json:"destinationProcessorId"`
		PestFreeConfirmation      bool            `json:"pestFreeConfirmation"`
		PestsFound                []string        `json:"pestsFound"`
		PestTreatmentActions      string          `json:"pestTreatmentActions"`
	}
	if err := json.Unmarshal([]byte(farmerDataJSON), &fdArg); err != nil {
		return nil, fmt.Errorf("invalid farmerDataJSON: %w. Ensure the JSON structure and all required fields are correct", err)
	}

	if err := s.validateRequiredString(fdArg.FarmerName, "farmerData.farmerName", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(fdArg.FarmLocation, "farmerData.farmLocation", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateGeoPoint(fdArg.FarmCoordinates, "farmerData.farmCoordinates", true); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(fdArg.CropType, "farmerData.cropType", maxStringInputLength); err != nil {
		return nil, err
	}
	plantingDate, err := parseDateString(fdArg.PlantingDateStr, "farmerData.plantingDate", true)
	if err != nil {
		return nil, err
	}
	if err := s.validateOptionalString(fdArg.FertilizerUsed, "farmerData.fertilizerUsed", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateOptionalString(fdArg.CertificationDocumentHash, "farmerData.certificationDocumentHash", maxStringInputLength); err != nil {
		return nil, err
	} // Hash can be long
	harvestDate, err := parseDateString(fdArg.HarvestDateStr, "farmerData.harvestDate", true)
	if err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(fdArg.FarmingPractice, "farmerData.farmingPractice", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(fdArg.BedType, "farmerData.bedType", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(fdArg.IrrigationMethod, "farmerData.irrigationMethod", maxStringInputLength); err != nil {
		return nil, err
	}
	organicSince, err := parseDateString(fdArg.OrganicSinceStr, "farmerData.organicSince", true)
	if err != nil {
		return nil, err
	}
	// Enforce organic period >= 3 years
	now, err := s.getCurrentTxTimestamp(ctx)
	if err != nil {
		return nil, err
	}
	if organicSince.AddDate(3, 0, 0).After(now) {
		return nil, fmt.Errorf("farm must be organic for at least 3 years")
	}
	if fdArg.BufferZoneMeters < 8 {
		return nil, fmt.Errorf("buffer zones must be at least 8 meters")
	}
	if err := s.validateRequiredString(fdArg.DestinationProcessorID, "farmerData.destinationProcessorId", maxStringInputLength*2); err != nil {
		return nil, err
	}
	if !fdArg.PestFreeConfirmation && len(fdArg.PestsFound) == 0 {
		return nil, fmt.Errorf("either pestFreeConfirmation must be true or pestsFound specified")
	}
	if err := s.validateStringArray(fdArg.PestsFound, "farmerData.pestsFound", maxArrayElements, maxStringInputLength); err != nil {
		return nil, err
	}
	if len(fdArg.PestsFound) > 0 {
		if err := s.validateRequiredString(fdArg.PestTreatmentActions, "farmerData.pestTreatmentActions", maxDescriptionLength); err != nil {
			return nil, err
		}
	}

	return &ValidatedFarmerData{
		FarmerName:                fdArg.FarmerName,
		FarmLocation:              fdArg.FarmLocation,
		FarmCoordinates:           fdArg.FarmCoordinates,
		CropType:                  fdArg.CropType,
		PlantingDate:              plantingDate,
		FertilizerUsed:            fdArg.FertilizerUsed,
		CertificationDocumentHash: fdArg.CertificationDocumentHash,
		HarvestDate:               harvestDate,
		FarmingPractice:           fdArg.FarmingPractice,
		BedType:                   fdArg.BedType,
		IrrigationMethod:          fdArg.IrrigationMethod,
		OrganicSince:              organicSince,
		BufferZoneMeters:          fdArg.BufferZoneMeters,
		DestinationProcessorID:    fdArg.DestinationProcessorID,
		PestFreeConfirmation:      fdArg.PestFreeConfirmation,
		PestsFound:                fdArg.PestsFound,
		PestTreatmentActions:      fdArg.PestTreatmentActions,
	}, nil
}

func (s *FoodtraceSmartContract) validateProcessorDataArgs(pdJSON string) (*model.ProcessorData, error) {
	var pdArgRaw struct { // Use raw struct for unmarshalling string dates
		DateProcessedStr         string          `json:"dateProcessed"`
		ProcessingType           string          `json:"processingType"`
		ProcessingLineID         string          `json:"processingLineId"`
		ProcessingLocation       string          `json:"processingLocation"`
		ProcessingCoordinates    *model.GeoPoint `json:"processingCoordinates"`
		ContaminationCheck       string          `json:"contaminationCheck"`
		OutputBatchID            string          `json:"outputBatchId"`
		ExpiryDateStr            string          `json:"expiryDate"`
		QualityCertifications    []string        `json:"qualityCertifications"`
		DestinationDistributorID string          `json:"destinationDistributorId"`
		TimeToCoolMinutes        int             `json:"timeToCoolMinutes"`
	}
	if err := json.Unmarshal([]byte(pdJSON), &pdArgRaw); err != nil {
		return nil, fmt.Errorf("invalid processorDataJSON: %w", err)
	}

	dateProcessed, err := parseDateString(pdArgRaw.DateProcessedStr, "processorData.dateProcessed", true)
	if err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(pdArgRaw.ProcessingType, "processorData.processingType", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(pdArgRaw.ProcessingLineID, "processorData.processingLineId", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(pdArgRaw.ProcessingLocation, "processorData.processingLocation", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateGeoPoint(pdArgRaw.ProcessingCoordinates, "processorData.processingCoordinates", true); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(pdArgRaw.ContaminationCheck, "processorData.contaminationCheck", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateOptionalString(pdArgRaw.OutputBatchID, "processorData.outputBatchId", maxStringInputLength); err != nil {
		return nil, err
	}
	expiryDate, err := parseDateString(pdArgRaw.ExpiryDateStr, "processorData.expiryDate", false)
	if err != nil {
		return nil, err
	}
	if err := s.validateStringArray(pdArgRaw.QualityCertifications, "processorData.qualityCertifications", maxArrayElements, maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(pdArgRaw.DestinationDistributorID, "processorData.destinationDistributorId", maxStringInputLength*2); err != nil {
		return nil, err
	}
	if pdArgRaw.TimeToCoolMinutes <= 0 {
		return nil, fmt.Errorf("processorData.timeToCoolMinutes must be positive")
	}
	if pdArgRaw.TimeToCoolMinutes > maxTimeToCoolMinutes {
		return nil, fmt.Errorf("timeToCoolMinutes exceeds SLA of %d minutes", maxTimeToCoolMinutes)
	}

	return &model.ProcessorData{ // Return model.ProcessorData with parsed dates
		DateProcessed: dateProcessed, ProcessingType: pdArgRaw.ProcessingType, ProcessingLineID: pdArgRaw.ProcessingLineID,
		ProcessingLocation: pdArgRaw.ProcessingLocation, ProcessingCoordinates: pdArgRaw.ProcessingCoordinates,
		ContaminationCheck: pdArgRaw.ContaminationCheck, OutputBatchID: pdArgRaw.OutputBatchID,
		ExpiryDate:               expiryDate,
		QualityCertifications:    pdArgRaw.QualityCertifications,
		DestinationDistributorID: pdArgRaw.DestinationDistributorID,
		TimeToCoolMinutes:        pdArgRaw.TimeToCoolMinutes,
	}, nil
}

// FIXED: Complete validation for distributor data
func (s *FoodtraceSmartContract) validateDistributorDataArgs(ddJSON string) (*model.DistributorData, error) {
	var ddArgRaw struct {
		PickupDateTimeStr     string           `json:"pickupDateTime"`
		DeliveryDateTimeStr   string           `json:"deliveryDateTime"`
		DistributionLineID    string           `json:"distributionLineId"`
		TemperatureRange      string           `json:"temperatureRange"`
		StorageTemperature    *float64         `json:"storageTemperature"`
		TransitLocationLog    []string         `json:"transitLocationLog"`
		TransitGPSLog         []model.GeoPoint `json:"transitGpsLog"`
		TransportConditions   string           `json:"transportConditions"`
		DistributionCenter    string           `json:"distributionCenter"`
		DestinationRetailerID string           `json:"destinationRetailerId"`
	}
	if err := json.Unmarshal([]byte(ddJSON), &ddArgRaw); err != nil {
		return nil, fmt.Errorf("invalid distributorDataJSON: %w", err)
	}

	pickupDateTime, err := parseDateString(ddArgRaw.PickupDateTimeStr, "distributorData.pickupDateTime", true)
	if err != nil {
		return nil, err
	}
	deliveryDateTime, err := parseDateString(ddArgRaw.DeliveryDateTimeStr, "distributorData.deliveryDateTime", false)
	if err != nil {
		return nil, err
	}

	// FIXED: Complete all validation calls
	if err := s.validateRequiredString(ddArgRaw.DistributionLineID, "distributorData.distributionLineId", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateOptionalString(ddArgRaw.TemperatureRange, "distributorData.temperatureRange", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateStringArray(ddArgRaw.TransitLocationLog, "distributorData.transitLocationLog", maxArrayElements, maxDescriptionLength); err != nil {
		return nil, err
	}
	if err := s.validateGeoPointArray(ddArgRaw.TransitGPSLog, "distributorData.transitGpsLog", maxArrayElements); err != nil {
		return nil, err
	}
	if err := s.validateOptionalString(ddArgRaw.TransportConditions, "distributorData.transportConditions", maxDescriptionLength); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(ddArgRaw.DistributionCenter, "distributorData.distributionCenter", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(ddArgRaw.DestinationRetailerID, "distributorData.destinationRetailerId", maxStringInputLength*2); err != nil {
		return nil, err
	}

	var storageTempValue float64
	if ddArgRaw.StorageTemperature != nil {
		storageTempValue = *ddArgRaw.StorageTemperature
	}

	return &model.DistributorData{
		PickupDateTime:        pickupDateTime,
		DeliveryDateTime:      deliveryDateTime,
		DistributionLineID:    ddArgRaw.DistributionLineID,
		TemperatureRange:      ddArgRaw.TemperatureRange,
		StorageTemperature:    storageTempValue,
		TransitLocationLog:    ddArgRaw.TransitLocationLog,
		TransitGPSLog:         ddArgRaw.TransitGPSLog,
		TransportConditions:   ddArgRaw.TransportConditions,
		DistributionCenter:    ddArgRaw.DistributionCenter,
		DestinationRetailerID: ddArgRaw.DestinationRetailerID,
	}, nil
}

// FIXED: Complete validation for retailer data
func (s *FoodtraceSmartContract) validateRetailerDataArgs(rdJSON string) (*model.RetailerData, error) {
	var rdArgRaw struct {
		DateReceivedStr       string          `json:"dateReceived"`
		RetailerLineID        string          `json:"retailerLineId"`
		ProductNameRetail     string          `json:"productNameRetail"`
		ShelfLife             string          `json:"shelfLife"`
		SellByDateStr         string          `json:"sellByDate"`
		RetailerExpiryDateStr string          `json:"retailerExpiryDate"`
		StoreID               string          `json:"storeId"`
		StoreLocation         string          `json:"storeLocation"`
		StoreCoordinates      *model.GeoPoint `json:"storeCoordinates"`
		Price                 *float64        `json:"price"`
		QRCodeLink            string          `json:"qrCodeLink"`
	}
	if err := json.Unmarshal([]byte(rdJSON), &rdArgRaw); err != nil {
		return nil, fmt.Errorf("invalid retailerDataJSON: %w", err)
	}

	dateReceived, err := parseDateString(rdArgRaw.DateReceivedStr, "retailerData.dateReceived", true)
	if err != nil {
		return nil, err
	}
	sellByDate, err := parseDateString(rdArgRaw.SellByDateStr, "retailerData.sellByDate", false)
	if err != nil {
		return nil, err
	}
	retailerExpiryDate, err := parseDateString(rdArgRaw.RetailerExpiryDateStr, "retailerData.retailerExpiryDate", false)
	if err != nil {
		return nil, err
	}

	// FIXED: Complete all validation calls
	if err := s.validateRequiredString(rdArgRaw.RetailerLineID, "retailerData.retailerLineId", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(rdArgRaw.ProductNameRetail, "retailerData.productNameRetail", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateOptionalString(rdArgRaw.ShelfLife, "retailerData.shelfLife", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateOptionalString(rdArgRaw.StoreID, "retailerData.storeId", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateRequiredString(rdArgRaw.StoreLocation, "retailerData.storeLocation", maxStringInputLength); err != nil {
		return nil, err
	}
	if err := s.validateGeoPoint(rdArgRaw.StoreCoordinates, "retailerData.storeCoordinates", true); err != nil {
		return nil, err
	}
	if err := s.validateOptionalString(rdArgRaw.QRCodeLink, "retailerData.qrCodeLink", maxStringInputLength*2); err != nil {
		return nil, err
	}

	var priceValue float64
	if rdArgRaw.Price != nil {
		priceValue = *rdArgRaw.Price
		if priceValue < 0 {
			return nil, errors.New("retailerData.price cannot be negative")
		}
	}

	return &model.RetailerData{
		DateReceived: dateReceived, RetailerLineID: rdArgRaw.RetailerLineID, ProductNameRetail: rdArgRaw.ProductNameRetail,
		ShelfLife: rdArgRaw.ShelfLife, SellByDate: sellByDate, RetailerExpiryDate: retailerExpiryDate,
		StoreID: rdArgRaw.StoreID, StoreLocation: rdArgRaw.StoreLocation, StoreCoordinates: rdArgRaw.StoreCoordinates, Price: priceValue, QRCodeLink: rdArgRaw.QRCodeLink,
	}, nil
}

// --- Other General Helper Methods ---

// Enhanced ensureShipmentSchemaCompliance in shipment_helpers.go
func ensureShipmentSchemaCompliance(shipment *model.Shipment) {
	if shipment == nil {
		return
	}

	// FIXED: Initialize top-level slices as empty, not nil
	if shipment.InputShipmentIDs == nil {
		shipment.InputShipmentIDs = []string{}
	}
	if shipment.CertificationRecords == nil {
		shipment.CertificationRecords = []model.CertificationRecord{}
	}
	if shipment.History == nil {
		shipment.History = []model.HistoryEntry{}
	}

	// Initialize FarmerData if nil and ensure it has no nil slices
	if shipment.FarmerData == nil {
		shipment.FarmerData = &model.FarmerData{}
	}
	if shipment.FarmerData.PestsFound == nil {
		shipment.FarmerData.PestsFound = []string{}
	}

	// Initialize ProcessorData if nil and ensure nested slices are not nil
	if shipment.ProcessorData == nil {
		shipment.ProcessorData = &model.ProcessorData{
			QualityCertifications: []string{}, // FIXED: Initialize as empty slice
		}
	} else {
		// Ensure nested slice is not nil
		if shipment.ProcessorData.QualityCertifications == nil {
			shipment.ProcessorData.QualityCertifications = []string{}
		}
	}

	// Initialize DistributorData if nil and ensure nested slices are not nil
	if shipment.DistributorData == nil {
		shipment.DistributorData = &model.DistributorData{
			TransitLocationLog:    []string{},
			TransitGPSLog:         []model.GeoPoint{},
			TransitTemperatureLog: []model.TemperatureReading{},
		}
	} else {
		// Ensure nested slice is not nil
		if shipment.DistributorData.TransitLocationLog == nil {
			shipment.DistributorData.TransitLocationLog = []string{}
		}
		if shipment.DistributorData.TransitGPSLog == nil {
			shipment.DistributorData.TransitGPSLog = []model.GeoPoint{}
		}
		if shipment.DistributorData.TransitTemperatureLog == nil {
			shipment.DistributorData.TransitTemperatureLog = []model.TemperatureReading{}
		}
	}

	// Initialize RetailerData if nil
	if shipment.RetailerData == nil {
		shipment.RetailerData = &model.RetailerData{}
	}

	// Initialize RecallInfo if nil and ensure nested slices are not nil
	if shipment.RecallInfo == nil {
		shipment.RecallInfo = &model.RecallInfo{
			IsRecalled:        false,
			LinkedShipmentIDs: []string{}, // FIXED: Initialize as empty slice
		}
	} else {
		// Ensure nested slice is not nil
		if shipment.RecallInfo.LinkedShipmentIDs == nil {
			shipment.RecallInfo.LinkedShipmentIDs = []string{}
		}
	}
}

// Alternative helper function to ensure any model.IdentityInfo has proper slice initialization
func ensureIdentityInfoSchemaCompliance(idInfo *model.IdentityInfo) {
	if idInfo == nil {
		return
	}

	// FIXED: Initialize Roles slice as empty, not nil
	if idInfo.Roles == nil {
		idInfo.Roles = []string{}
	}
}

// getShipmentAndVerifyStage fetches a shipment and verifies its status and designee.
func (s *FoodtraceSmartContract) getShipmentAndVerifyStage(ctx contractapi.TransactionContextInterface, shipmentID string, expectedStatus model.ShipmentStatus, actorFullID string) (*model.Shipment, error) {
	shipment, err := s.getShipmentByID(ctx, shipmentID) // Uses query_ops internal helper
	if err != nil {
		return nil, err
	}

	if shipment.RecallInfo != nil && shipment.RecallInfo.IsRecalled && expectedStatus != model.StatusRecalled {
		return nil, fmt.Errorf("shipment '%s' is recalled – no further processing", shipmentID)
	}
	if shipment.Status != expectedStatus {
		return nil, fmt.Errorf("shipment '%s' status '%s', expected '%s'", shipmentID, shipment.Status, expectedStatus)
	}

	var designated string
	switch expectedStatus {
	case model.StatusCreated: // Farmer designates Processor
		if shipment.FarmerData == nil {
			return nil, errors.New("missing FarmerData – cannot verify processor destination")
		}
		designated = shipment.FarmerData.DestinationProcessorID
	case model.StatusProcessed: // Processor designates Distributor
		if shipment.ProcessorData == nil {
			return nil, errors.New("missing ProcessorData – cannot verify distributor destination")
		}
		designated = shipment.ProcessorData.DestinationDistributorID
	case model.StatusDistributed: // Distributor designates Retailer
		if shipment.DistributorData == nil {
			return nil, errors.New("missing DistributorData – cannot verify retailer destination")
		}
		designated = shipment.DistributorData.DestinationRetailerID
	default:
		return shipment, nil // No designated-recipient check for other states
	}

	if strings.TrimSpace(designated) == "" {
		return nil, fmt.Errorf("shipment '%s' does not declare a designated recipient for this stage", shipmentID)
	}
	im := NewIdentityManager(ctx) // Needed for resolution if `actorFullID` is an alias
	resolvedDesignated, err := im.ResolveIdentity(designated)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve designated recipient '%s' for shipment '%s': %w", designated, shipmentID, err)
	}
	resolvedActorFullID, err := im.ResolveIdentity(actorFullID) // Ensure actorFullID is also resolved
	if err != nil {
		return nil, fmt.Errorf("failed to resolve current actor '%s': %w", actorFullID, err)
	}

	if resolvedDesignated != resolvedActorFullID {
		// For logging, try to get aliases for better messages
		designatedAlias := designated
		actorAlias := actorFullID
		desigInfo, _ := im.GetIdentityInfo(resolvedDesignated)
		if desigInfo != nil {
			designatedAlias = desigInfo.ShortName
		}
		actorInfoFromIM, _ := im.GetIdentityInfo(resolvedActorFullID)
		if actorInfoFromIM != nil {
			actorAlias = actorInfoFromIM.ShortName
		}

		return nil, fmt.Errorf("unauthorized – caller '%s' (resolved: %s) is not the designated recipient '%s' (resolved: %s) for shipment '%s'",
			actorAlias, resolvedActorFullID, designatedAlias, resolvedDesignated, shipmentID)
	}
	return shipment, nil
}

// enrichShipmentAliases populates alias fields in the shipment data if they are empty.
func (s *FoodtraceSmartContract) enrichShipmentAliases(im *IdentityManager, shipment *model.Shipment) {
	if shipment == nil {
		return
	}

	enrich := func(id, currentAlias string) string {
		if currentAlias == "" && id != "" {
			if info, err := im.GetIdentityInfo(id); err == nil && info != nil {
				return info.ShortName
			}
		}
		return currentAlias
	}

	shipment.CurrentOwnerAlias = enrich(shipment.CurrentOwnerID, shipment.CurrentOwnerAlias)
	if shipment.FarmerData != nil {
		shipment.FarmerData.FarmerAlias = enrich(shipment.FarmerData.FarmerID, shipment.FarmerData.FarmerAlias)
	}
	if shipment.ProcessorData != nil {
		shipment.ProcessorData.ProcessorAlias = enrich(shipment.ProcessorData.ProcessorID, shipment.ProcessorData.ProcessorAlias)
	}
	if shipment.DistributorData != nil {
		shipment.DistributorData.DistributorAlias = enrich(shipment.DistributorData.DistributorID, shipment.DistributorData.DistributorAlias)
	}
	if shipment.RetailerData != nil {
		shipment.RetailerData.RetailerAlias = enrich(shipment.RetailerData.RetailerID, shipment.RetailerData.RetailerAlias)
	}
	if shipment.RecallInfo != nil {
		shipment.RecallInfo.RecalledByAlias = enrich(shipment.RecallInfo.RecalledBy, shipment.RecallInfo.RecalledByAlias)
	}
	if shipment.CertificationRecords != nil {
		for i := range shipment.CertificationRecords {
			shipment.CertificationRecords[i].CertifierAlias = enrich(shipment.CertificationRecords[i].CertifierID, shipment.CertificationRecords[i].CertifierAlias)
		}
	}
}

// emitShipmentEvent sends a chaincode event.
func (s *FoodtraceSmartContract) emitShipmentEvent(ctx contractapi.TransactionContextInterface, eventName string, shipment *model.Shipment, actor *actorInfo, additionalPayload map[string]interface{}) {
	if shipment == nil || actor == nil {
		logger.Errorf("emitShipmentEvent: cannot emit event, shipment or actor is nil. Event: %s", eventName)
		return
	}
	payload := map[string]interface{}{
		"shipmentId":           shipment.ID,
		"productName":          shipment.ProductName,
		"status":               shipment.Status,
		"currentOwnerId":       shipment.CurrentOwnerID,
		"currentOwnerAlias":    shipment.CurrentOwnerAlias,
		"actorFullId":          actor.fullID,
		"actorAlias":           actor.alias,
		"transactionTimestamp": shipment.LastUpdatedAt.Format(time.RFC3339), // Use LastUpdatedAt as event time
	}
	if additionalPayload != nil {
		for k, v := range additionalPayload {
			if t, ok := v.(time.Time); ok {
				payload[k] = t.Format(time.RFC3339)
			} else {
				payload[k] = v
			}
		}
	}
	eventBytes, err := json.Marshal(payload)
	if err != nil {
		logger.Warningf("emitShipmentEvent: Failed to marshal event payload for event '%s' on shipment '%s': %v", eventName, shipment.ID, err)
		return
	}
	if errSet := ctx.GetStub().SetEvent(eventName, eventBytes); errSet != nil {
		logger.Warningf("emitShipmentEvent: Failed to set event '%s' for shipment '%s': %v", eventName, shipment.ID, errSet)
	}
}

// AbsDuration returns the absolute value of a time.Duration.
func AbsDuration(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}

// min is a simple helper for int.
func min(a, b int) int {
	if b < a {
		return b
	}
	return a
}

// requireAdmin is a helper to check if the current caller is an admin.
func (s *FoodtraceSmartContract) requireAdmin(ctx contractapi.TransactionContextInterface, im *IdentityManager) error {
	isCallerAdmin, err := im.IsCurrentUserAdmin()
	if err != nil {
		return fmt.Errorf("failed to check admin status: %w", err)
	}
	if !isCallerAdmin {
		callerID, _ := im.GetCurrentIdentityFullID() // Best effort to get ID for logging
		return fmt.Errorf("unauthorized: caller '%s' is not an admin", callerID)
	}
	return nil
}
