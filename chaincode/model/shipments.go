package model

import "time"

// ShipmentStatus defines the possible states of a shipment.
type ShipmentStatus string

const (
	StatusCreated               ShipmentStatus = "CREATED"                // Shipment registered by farmer
	StatusPendingCertification  ShipmentStatus = "PENDING_CERTIFICATION"  // Shipment awaiting certifier action
	StatusCertified             ShipmentStatus = "CERTIFIED"              // Shipment certified by certifier
	StatusCertificationRejected ShipmentStatus = "CERTIFICATION_REJECTED" // Shipment certification rejected by certifier
	StatusProcessed             ShipmentStatus = "PROCESSED"              // Shipment processed by processor
	StatusDistributed           ShipmentStatus = "DISTRIBUTED"            // Shipment distributed by distributor
	StatusDelivered             ShipmentStatus = "DELIVERED"              // Shipment received by retailer
	StatusConsumed              ShipmentStatus = "CONSUMED"               // (Optional) Shipment marked as consumed/sold by retailer
	StatusRecalled              ShipmentStatus = "RECALLED"               // Shipment has been recalled
	StatusConsumedInProcessing  ShipmentStatus = "CONSUMED_IN_PROCESSING" // Input shipment consumed in a transformation
)

// CertificationStatus defines the possible states of an organic certification.
type CertificationStatus string

const (
	CertStatusPending  CertificationStatus = "PENDING"
	CertStatusApproved CertificationStatus = "APPROVED"
	CertStatusRejected CertificationStatus = "REJECTED"
)

// GeoPoint represents a latitude/longitude coordinate.
type GeoPoint struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// FarmerData holds information specific to the farming stage.
type FarmerData struct {
	FarmerID                  string    `json:"farmerId"`
	FarmerName                string    `json:"farmerName"`
	FarmerAlias               string    `json:"farmerAlias"`
	FarmLocation              string    `json:"farmLocation"`
	FarmCoordinates           *GeoPoint `json:"farmCoordinates"`
	CropType                  string    `json:"cropType"`
	PlantingDate              time.Time `json:"plantingDate"`
	FertilizerUsed            string    `json:"fertilizerUsed"`
	CertificationDocumentHash string    `json:"certificationDocumentHash"`
	CertificationDocumentURL  string    `json:"certificationDocumentURL"`
	HarvestDate               time.Time `json:"harvestDate"`
	FarmingPractice           string    `json:"farmingPractice"`
	BedType                   string    `json:"bedType"`
	IrrigationMethod          string    `json:"irrigationMethod"`
	OrganicSince              time.Time `json:"organicSince"`
	BufferZoneMeters          float64   `json:"bufferZoneMeters"`
	DestinationProcessorID    string    `json:"destinationProcessorId"`
}

// ProcessorData holds information specific to the processing stage.
type ProcessorData struct {
	ProcessorID              string    `json:"processorId"`
	ProcessorAlias           string    `json:"processorAlias"`
	DateProcessed            time.Time `json:"dateProcessed"`
	ProcessingType           string    `json:"processingType"`
	ProcessingLineID         string    `json:"processingLineId"`
	ProcessingLocation       string    `json:"processingLocation"`
	ProcessingCoordinates    *GeoPoint `json:"processingCoordinates"`
	ContaminationCheck       string    `json:"contaminationCheck"`
	OutputBatchID            string    `json:"outputBatchId"` // For simple processing; for transformations, new Shipment.ID is used.
	ExpiryDate               time.Time `json:"expiryDate"`
	QualityCertifications    []string  `json:"qualityCertifications"`
	DestinationDistributorID string    `json:"destinationDistributorId"`
}

// CertificationRecord holds information specific to an organic certification event.
type CertificationRecord struct {
	CertifierID          string              `json:"certifierId"`
	CertifierAlias       string              `json:"certifierAlias"`
	InspectionDate       time.Time           `json:"inspectionDate"`
	InspectionReportHash string              `json:"inspectionReportHash"`
	InspectionReportURL  string              `json:"inspectionReportURL"`
	Status               CertificationStatus `json:"status"`
	Comments             string              `json:"comments"`
	CertifiedAt          time.Time           `json:"certifiedAt"`
}

// DistributorData holds information specific to the distribution stage.
type DistributorData struct {
	DistributorID         string     `json:"distributorId"`
	DistributorAlias      string     `json:"distributorAlias"`
	PickupDateTime        time.Time  `json:"pickupDateTime"`
	DeliveryDateTime      time.Time  `json:"deliveryDateTime"`
	DistributionLineID    string     `json:"distributionLineId"`
	TemperatureRange      string     `json:"temperatureRange"`
	StorageTemperature    float64    `json:"storageTemperature"`
	TransitLocationLog    []string   `json:"transitLocationLog"`
	TransitGPSLog         []GeoPoint `json:"transitGpsLog"`
	TransportConditions   string     `json:"transportConditions"`
	DistributionCenter    string     `json:"distributionCenter"`
	DestinationRetailerID string     `json:"destinationRetailerId"`
}

// RetailerData holds information specific to the retail stage.
type RetailerData struct {
	RetailerID         string    `json:"retailerId"`
	RetailerAlias      string    `json:"retailerAlias"`
	DateReceived       time.Time `json:"dateReceived"`
	RetailerLineID     string    `json:"retailerLineId"`
	ProductNameRetail  string    `json:"productNameRetail"`
	ShelfLife          string    `json:"shelfLife"`
	SellByDate         time.Time `json:"sellByDate"`
	RetailerExpiryDate time.Time `json:"retailerExpiryDate"`
	StoreID            string    `json:"storeId"`
	StoreLocation      string    `json:"storeLocation"`
	StoreCoordinates   *GeoPoint `json:"storeCoordinates"`
	Price              float64   `json:"price"`
	QRCodeLink         string    `json:"qrCodeLink"`
}

// RecallInfo holds information about a shipment recall.
type RecallInfo struct {
	IsRecalled        bool      `json:"isRecalled"`
	RecallID          string    `json:"recallId"`
	RecallReason      string    `json:"recallReason"`
	RecallDate        time.Time `json:"recallDate"`
	RecalledBy        string    `json:"recalledBy"`
	RecalledByAlias   string    `json:"recalledByAlias"`
	LinkedShipmentIDs []string  `json:"linkedShipmentIds"`
}

// Shipment is the central data structure for tracking a food item through the supply chain.
type Shipment struct {
	ObjectType           string                `json:"objectType"`  // "Shipment"
	ID                   string                `json:"id"`          // Unique ID for the shipment
	ProductName          string                `json:"productName"` // General product name
	Description          string                `json:"description"`
	Quantity             float64               `json:"quantity"`
	UnitOfMeasure        string                `json:"unitOfMeasure"`
	CurrentOwnerID       string                `json:"currentOwnerId"`
	CurrentOwnerAlias    string                `json:"currentOwnerAlias"`
	Status               ShipmentStatus        `json:"status"`
	CreatedAt            time.Time             `json:"createdAt"`
	LastUpdatedAt        time.Time             `json:"lastUpdatedAt"`
	IsArchived           bool                  `json:"isArchived"`
	InputShipmentIDs     []string              `json:"inputShipmentIds"` // IDs of shipments consumed to create this one
	IsDerivedProduct     bool                  `json:"isDerivedProduct"` // True if this shipment was created from other input shipments
	FarmerData           *FarmerData           `json:"farmerData"`
	CertificationRecords []CertificationRecord `json:"certificationRecords"`
	ProcessorData        *ProcessorData        `json:"processorData"`
	DistributorData      *DistributorData      `json:"distributorData"`
	RetailerData         *RetailerData         `json:"retailerData"`
	RecallInfo           *RecallInfo           `json:"recallInfo"`
	History              []HistoryEntry        `json:"history"` // Populated by GetShipmentPublicDetails
}

// HistoryEntry represents one historical state of a shipment or an event.
type HistoryEntry struct {
	TxID       string    `json:"txId"`
	Timestamp  time.Time `json:"timestamp"`
	IsDelete   bool      `json:"isDelete"`
	Value      string    `json:"value"`      // Raw JSON value of the asset at that time
	ActorID    string    `json:"actorId"`    // Best guess of the actor based on CurrentOwnerID at the time
	ActorAlias string    `json:"actorAlias"` // Best guess of the actor's alias
	Action     string    `json:"action"`     // Description of the action (e.g., status change)
}

// RelatedShipmentInfo is used to return information about shipments related to a recall.
type RelatedShipmentInfo struct {
	ShipmentID        string         `json:"shipmentId"`
	ProductName       string         `json:"productName"`
	Status            ShipmentStatus `json:"status"`
	CurrentOwnerID    string         `json:"currentOwnerId"`
	CurrentOwnerAlias string         `json:"currentOwnerAlias"`
	RelationReason    string         `json:"relationReason"`
	ActorID           string         `json:"actorId"` // ID of the actor involved in the related event (e.g., processor)
	ActorAlias        string         `json:"actorAlias"`
	LineID            string         `json:"lineId"`         // e.g., processingLineId or distributionLineId
	EventTimestamp    time.Time      `json:"eventTimestamp"` // Timestamp of the relating event (e.g., DateProcessed)
}

// InputShipmentConsumptionDetail defines the ID of an input shipment to be fully consumed.
type InputShipmentConsumptionDetail struct {
	ShipmentID string `json:"shipmentId"` // ID of the input shipment (ingredient) to be fully consumed
}

// NewProductDetail defines the properties of a new product created from a transformation.
type NewProductDetail struct {
	NewShipmentID string  `json:"newShipmentId"`
	ProductName   string  `json:"productName"`
	Description   string  `json:"description"`
	Quantity      float64 `json:"quantity"`
	UnitOfMeasure string  `json:"unitOfMeasure"`
}

// PaginatedShipmentResponse is the structure returned by paginated shipment queries.
type PaginatedShipmentResponse struct {
	Shipments    []*Shipment `json:"shipments"`
	NextBookmark string      `json:"nextBookmark"`
	FetchedCount int32       `json:"fetchedCount"`
}
