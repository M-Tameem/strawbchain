# Shipment Route Diagrams

Below are several Mermaid diagrams illustrating how shipments move through the chaincode. Each diagram shows the flow at a different level of detail.

## 1. High-Level Shipment Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created
    Created --> PendingCert: SubmitForCertification
    PendingCert --> Certified: RecordCertification APPROVED
    PendingCert --> Rejected: RecordCertification REJECTED
    Created --> Processed: ProcessShipment (skip cert)
    Certified --> Processed: ProcessShipment
    Processed --> Distributed: DistributeShipment
    Distributed --> Delivered: ReceiveShipment
    Delivered --> Consumed: MarkConsumed
    Created --> Recalled: InitiateRecall
    PendingCert --> Recalled
    Certified --> Recalled
    Processed --> Recalled
    Distributed --> Recalled
    Delivered --> Recalled
    Consumed --> [*]
    Rejected --> [*]
    Recalled --> [*]
```

## 2. Detailed Chaincode Routes

```mermaid
flowchart TD
    subgraph Farmer
        CS[CreateShipment]
        SF[SubmitForCertification]
    end
    subgraph Certifier
        RC[RecordCertification]
    end
    subgraph Processor
        PS[ProcessShipment]
        TR[TransformAndCreateProducts]
    end
    subgraph Distributor
        DS[DistributeShipment]
    end
    subgraph Retailer
        RS[ReceiveShipment]
        MC[MarkConsumed]
    end
    subgraph Admin
        AR[ArchiveShipment]
        UR[UnarchiveShipment]
        IR[InitiateRecall]
        LR[AddLinkedShipmentsToRecall]
    end
    CS --> SF
    SF --> RC
    RC --> PS
    PS --> DS
    DS --> RS
    RS --> MC
    PS --> TR
    TR --> DS
    MC --> AR
    AR --> UR
    IR --> LR
```

## 3. BFF to Chaincode Interaction (Single Shipment Path)

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant API as BFF Server
    participant CC as Chaincode
    UI->>API: POST /shipments
    API->>CC: CreateShipment
    CC-->>API: result
    API-->>UI: confirmation
    UI->>API: POST /shipments/{id}/process
    API->>CC: ProcessShipment
    CC-->>API: result
    API-->>UI: confirmation
    UI->>API: POST /shipments/{id}/distribute
    API->>CC: DistributeShipment
    CC-->>API: result
    API-->>UI: confirmation
    UI->>API: POST /shipments/{id}/receive
    API->>CC: ReceiveShipment
    CC-->>API: result
    API-->>UI: final status
```

## 4. Multi‑Shipment Transformation

```mermaid
graph LR
    subgraph Input Shipments
        A1[Shipment A]
        A2[Shipment B]
        A3[Shipment C]
    end
    subgraph Processor
        T[TransformAndCreateProducts]
    end
    subgraph Output Shipments
        B1[Product X]
        B2[Product Y]
    end
    A1 --> T
    A2 --> T
    A3 --> T
    T --> B1
    T --> B2
```


## 5. Recall Process Sequence

```mermaid
sequenceDiagram
    participant Admin
    participant CC as Chaincode
    participant Ledger
    Admin->>CC: InitiateRecall
    CC->>Ledger: store recall info
    CC-->>Admin: recall created
    Admin->>CC: AddLinkedShipmentsToRecall
    CC->>Ledger: mark linked shipments
    CC-->>Admin: confirmation
```

## 6. Identity and Role Management

```mermaid
flowchart TD
    Admin[Admin CLI or UI] -->|RegisterIdentity| IM[IdentityManager]
    Admin -->|AssignRole| IM
    Admin -->|MakeAdmin| IM
    User -->|GetIdentityDetails| IM
    IM --> Ledger[(Ledger)]
```

## 7. Hyperledger Fabric Deployment

```mermaid
graph LR
    subgraph Client
        UI[Frontend]
        API[BFF Server]
    end
    subgraph FabricNetwork
        Orderer
        Peer
        CouchDB
        CC[Chaincode Container]
    end
    UI --> API
    API --> Peer
    Peer --> CC
    CC --> CouchDB
    Peer --> Orderer
    CC --> Orderer
```

## 8. Shipment Data Model

```mermaid
classDiagram
    class Shipment {
        string ID
        string ProductName
        float64 Quantity
        string UnitOfMeasure
        ShipmentStatus Status
        bool IsDerivedProduct
        string[] InputShipmentIDs
    }
    class FarmerData {
        string FarmerID
        string FarmerAlias
        string FarmLocation
        string CropType
    }
    class ProcessorData {
        string ProcessorID
        string ProcessingType
    }
    class DistributorData {
        string DistributorID
    }
    class RetailerData {
        string RetailerID
    }
    class RecallInfo {
        bool IsRecalled
        string RecallReason
    }
    class CertificationRecord {
        string CertifierID
        string Status
    }
    class HistoryEntry {
        string TxID
        string Action
    }
    Shipment o-- FarmerData
    Shipment o-- ProcessorData
    Shipment o-- DistributorData
    Shipment o-- RetailerData
    Shipment o-- RecallInfo
    Shipment -- "*" CertificationRecord
    Shipment -- "*" HistoryEntry
```

