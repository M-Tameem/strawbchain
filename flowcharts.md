I'll create comprehensive Mermaid visualizations for the FoodTrace supply chain system. Let me break this down into multiple logical flowcharts that clearly differentiate between frontend, server, and chaincode layers.

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph "Frontend Layer" 
        style Frontend fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
        UI[React UI<br/>FoodTraceApp.jsx]
    end
    
    subgraph "BFF Server Layer"
        style BFF fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
        AUTH[Authentication<br/>JWT]
        API[Express API<br/>server.js]
        DB[(SQLite DB<br/>Local Users)]
        BOOT[Bootstrap<br/>bootstrap.js]
        UTILS[DB Utils<br/>db-utils.js]
    end
    
    subgraph "Blockchain Layer"
        style Blockchain fill:#fff3e0,stroke:#f57c00,stroke-width:2px
        subgraph "Kaleido Platform"
            KID[Kaleido Identity<br/>Service]
            KTX[Kaleido Transaction<br/>Service]
        end
        
        subgraph "Chaincode"
            IM[Identity Manager<br/>identity_manager.go]
            SC[Shipment Contract<br/>shipment_contract.go]
            OPS[Operations<br/>*_ops.go files]
        end
        
        LEDGER[(Hyperledger<br/>Fabric Ledger)]
    end
    
    UI <-->|HTTP/REST| API
    API <--> AUTH
    API <--> DB
    API <-->|HTTPS| KID
    API <-->|HTTPS| KTX
    KTX <--> SC
    SC <--> IM
    SC <--> OPS
    IM <--> LEDGER
    OPS <--> LEDGER
    BOOT --> DB
    BOOT --> KID
    BOOT --> KTX
```

## 2. Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant F as Frontend
    participant S as Server
    participant DB as SQLite DB
    participant K as Kaleido
    participant C as Chaincode
    
    rect rgb(227, 242, 253)
        Note over F: Frontend Layer
    end
    
    rect rgb(232, 245, 233)
        Note over S,DB: Server Layer
    end
    
    rect rgb(255, 243, 224)
        Note over K,C: Blockchain Layer
    end
    
    F->>S: POST /api/auth/login<br/>{username, password}
    S->>DB: SELECT user WHERE username
    DB-->>S: User record
    S->>S: bcrypt.compare(password)
    
    alt Valid credentials
        S->>S: Generate JWT token
        S-->>F: {token, user info}
        F->>F: Store token in localStorage
        
        Note over F: Subsequent requests
        F->>S: API request + Bearer token
        S->>S: Verify JWT
        S->>K: Query/Invoke chaincode<br/>with user.kid_name
        K->>C: Execute function
        C-->>K: Result
        K-->>S: Response
        S-->>F: API response
    else Invalid credentials
        S-->>F: 401 Unauthorized
    end
```

## 3. Identity Management Flow

```mermaid
flowchart TB
    subgraph "Frontend Actions"
        style Frontend fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
        U1[View Identities]
        U2[Register User]
        U3[Assign Role]
        U4[Make Admin]
        U5[Remove Admin]
    end
    
    subgraph "Server Processing"
        style Server fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
        A1[GET /api/identities]
        A2[POST /api/auth/register]
        A3[POST /api/identities/:alias/roles]
        A4[POST /api/identities/:alias/admin]
        A5[DELETE /api/identities/:alias/admin]
        
        REG[Register Process]
        ENR[Enroll Process]
        VER[Verify Admin]
    end
    
    subgraph "Kaleido Services"
        style Kaleido fill:#ffebee,stroke:#d32f2f,stroke-width:2px
        KID1[Create Identity]
        KID2[Enroll Identity]
        KID3[Get Full ID]
    end
    
    subgraph "Chaincode Functions"
        style Chaincode fill:#fff3e0,stroke:#f57c00,stroke-width:2px
        C1[GetAllIdentities]
        C2[RegisterIdentity]
        C3[AssignRole]
        C4[MakeAdmin]
        C5[RemoveAdmin]
        
        IM1[Check Admin Status]
        IM2[Resolve Identity]
        IM3[Update Roles]
    end
    
    U1 --> A1
    U2 --> A2
    U3 --> A3
    U4 --> A4
    U5 --> A5
    
    A1 --> VER
    VER --> C1
    
    A2 --> REG
    REG --> KID1
    KID1 --> ENR
    ENR --> KID2
    KID2 --> KID3
    KID3 --> C2
    
    A3 --> C3
    A4 --> C4
    A5 --> C5
    
    C1 --> IM2
    C2 --> IM1
    C3 --> IM3
    C4 --> IM1
    C5 --> IM1
```

## 4. Shipment Lifecycle Flow

```mermaid
stateDiagram-v2
    [*] --> Created: Farmer creates shipment
    
    state "Frontend Layer" as FL {
        state "Create Shipment Form" as CSF
        state "Submit for Cert" as SFC
        state "Process Form" as PF
        state "Distribute Form" as DF
        state "Receive Form" as RF
    }
    
    state "Server Layer" as SL {
        state "POST /shipments" as PS
        state "POST /certification/submit" as PCS
        state "POST /process" as PP
        state "POST /distribute" as PD
        state "POST /receive" as PR
    }
    
    state "Chaincode Layer" as CL {
        Created: Status: CREATED
        PendingCert: Status: PENDING_CERTIFICATION
        Certified: Status: CERTIFIED
        Processed: Status: PROCESSED
        Distributed: Status: DISTRIBUTED
        Delivered: Status: DELIVERED
        
        Created --> PendingCert: SubmitForCertification
        PendingCert --> Certified: RecordCertification(APPROVED)
        PendingCert --> CertRejected: RecordCertification(REJECTED)
        Created --> Processed: ProcessShipment (skip cert)
        Certified --> Processed: ProcessShipment
        Processed --> Distributed: DistributeShipment
        Distributed --> Delivered: ReceiveShipment
        
        state CertRejected {
            [*] --> End
        }
    }
```

## 5. Detailed Shipment Operations Flow

```mermaid
flowchart LR
    subgraph "Farmer Operations"
        style Farmer fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
        F1[Create Shipment]
        F2[Submit for Certification]
    end
    
    subgraph "Certifier Operations"
        style Certifier fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
        CE1[View Pending]
        CE2[Record Certification]
    end
    
    subgraph "Processor Operations"
        style Processor fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px
        P1[Process Shipment]
        P2[Transform Products]
    end
    
    subgraph "Distributor Operations"
        style Distributor fill:#fce4ec,stroke:#c2185b,stroke-width:2px
        D1[Distribute Shipment]
        D2[Update Transit Log]
    end
    
    subgraph "Retailer Operations"
        style Retailer fill:#e0f2f1,stroke:#00796b,stroke-width:2px
        R1[Receive Shipment]
        R2[Initiate Recall]
    end
    
    subgraph "Server Processing"
        style Server fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
        S1[Validate Input]
        S2[Check Permissions]
        S3[Invoke Chaincode]
        S4[Update Local DB]
        S5[Return Response]
    end
    
    subgraph "Chaincode Validation"
        style Chaincode fill:#fff3e0,stroke:#f57c00,stroke-width:2px
        V1[Verify Role]
        V2[Check Status]
        V3[Verify Ownership]
        V4[Update Ledger]
        V5[Emit Event]
    end
    
    F1 --> S1
    F2 --> S1
    CE2 --> S1
    P1 --> S1
    D1 --> S1
    R1 --> S1
    
    S1 --> S2
    S2 --> S3
    S3 --> V1
    V1 --> V2
    V2 --> V3
    V3 --> V4
    V4 --> V5
    V5 --> S4
    S4 --> S5
```

## 6. Recall Management Flow

```mermaid
flowchart TB
    subgraph "Recall Initiation"
        style Recall fill:#ffebee,stroke:#d32f2f,stroke-width:2px
        R1[Owner/Admin Initiates Recall]
        R2[Enter Recall Details]
        R3[Submit Recall Request]
    end
    
    subgraph "Server Processing"
        style Server fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
        S1[POST /api/recalls/initiate]
        S2[Verify Ownership/Admin]
        S3[Query Related Shipments]
        S4[POST /api/recalls/:id/linked-shipments]
    end
    
    subgraph "Chaincode Processing"
        style Chaincode fill:#fff3e0,stroke:#f57c00,stroke-width:2px
        C1[InitiateRecall]
        C2[Check Permissions]
        C3[Update Shipment Status]
        C4[QueryRelatedShipments]
        C5[AddLinkedShipmentsToRecall]
        
        subgraph "Related Query Logic"
            Q1[Check Same Processor]
            Q2[Check Same Distributor]
            Q3[Check Time Window]
            Q4[Check Same Farm]
        end
    end
    
    subgraph "Affected Shipments"
        style Affected fill:#fff9c4,stroke:#fbc02d,stroke-width:2px
        A1[Mark as RECALLED]
        A2[Update RecallInfo]
        A3[Emit Recall Event]
        A4[Link to Primary Recall]
    end
    
    R1 --> R2
    R2 --> R3
    R3 --> S1
    S1 --> S2
    S2 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> A1
    A1 --> A2
    A2 --> A3
    
    S2 --> S3
    S3 --> C4
    C4 --> Q1
    C4 --> Q2
    C4 --> Q3
    C4 --> Q4
    
    Q1 --> S4
    Q2 --> S4
    Q3 --> S4
    Q4 --> S4
    
    S4 --> C5
    C5 --> A4
```

## 7. Bootstrap & Startup Flow

```mermaid
flowchart TD
    subgraph "Startup Process"
        style Startup fill:#f0f4c3,stroke:#827717,stroke-width:2px
        START[npm start / node start.js]
        CHECK_ENV[Check Environment Variables]
        CHECK_DB[Check Database]
        
        decision1{Environment OK?}
        decision2{Admin Exists?}
        decision3{Bootstrap Success?}
    end
    
    subgraph "Bootstrap Process"
        style Bootstrap fill:#e1bee7,stroke:#6a1b9a,stroke-width:2px
        B1[Create Database]
        B2[Register Kaleido Identity]
        B3[Enroll Identity]
        B4[Get Full ID]
        B5[Pre-register Admin]
        B6[Bootstrap Ledger]
        B7[Save Admin to DB]
        B8[Verify Setup]
    end
    
    subgraph "Import Process"
        style Import fill:#ffccbc,stroke:#d84315,stroke-width:2px
        I1[Read Python Config]
        I2[Check Existing Admin]
        I3[Import to Local DB]
    end
    
    subgraph "Server Start"
        style Server fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px
        S1[Initialize Express]
        S2[Setup Middleware]
        S3[Setup Routes]
        S4[Start Listening]
    end
    
    START --> CHECK_ENV
    CHECK_ENV --> decision1
    
    decision1 -->|No| EXIT[Exit with Error]
    decision1 -->|Yes| CHECK_DB
    
    CHECK_DB --> decision2
    decision2 -->|Yes| S1
    decision2 -->|No| B1
    
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> B5
    B5 --> B6
    B6 --> decision3
    
    decision3 -->|Yes| B7
    decision3 -->|No| I1
    
    B7 --> B8
    B8 --> S1
    
    I1 --> I2
    I2 --> I3
    I3 --> S1
    
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> READY[Server Ready on Port 3001]
```

## 8. Component Interaction Diagram

```mermaid
graph TB
    subgraph "React Components"
        style React fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
        MAIN[MainApp]
        DASH[DashboardView]
        SHIP[ShipmentsView]
        IDENT[IdentitiesView]
        ACT[ActionsView]
        
        MAIN --> DASH
        MAIN --> SHIP
        MAIN --> IDENT
        MAIN --> ACT
    end
    
    subgraph "API Endpoints"
        style API fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
        
        subgraph "Auth"
            A1[/auth/login]
            A2[/auth/register]
        end
        
        subgraph "Identities"
            I1[/identities]
            I2[/identities/:alias]
            I3[/identities/:alias/roles]
            I4[/identities/:alias/admin]
        end
        
        subgraph "Shipments"
            S1[/shipments/all]
            S2[/shipments/my]
            S3[/shipments/:id]
            S4[/shipments - POST]
            S5[/shipments/:id/process]
            S6[/shipments/:id/distribute]
            S7[/shipments/:id/receive]
        end
        
        subgraph "Admin"
            AD1[/shipments/:id/archive]
            AD2[/shipments/:id/unarchive]
        end
        
        subgraph "Recalls"
            R1[/recalls/initiate]
            R2[/recalls/:id/linked-shipments]
            R3[/recalls/:id/related]
        end
    end
    
    DASH --> S1
    DASH --> S2
    SHIP --> S1
    SHIP --> S2
    SHIP --> S3
    SHIP --> AD1
    SHIP --> AD2
    SHIP --> R1
    
    IDENT --> I1
    IDENT --> I3
    IDENT --> I4
    
    ACT --> S4
    ACT --> S5
    ACT --> S6
    ACT --> S7
```

## 9. Chaincode Data Model

```mermaid
classDiagram
    class IdentityInfo {
        +string ObjectType
        +string FullID
        +string ShortName
        +string EnrollmentID
        +string OrganizationMSP
        +string[] Roles
        +bool IsAdmin
        +string RegisteredBy
        +time RegisteredAt
        +time LastUpdatedAt
    }
    
    class Shipment {
        +string ObjectType
        +string ID
        +string ProductName
        +string Description
        +float64 Quantity
        +string UnitOfMeasure
        +string CurrentOwnerID
        +string CurrentOwnerAlias
        +ShipmentStatus Status
        +time CreatedAt
        +time LastUpdatedAt
        +bool IsArchived
        +string[] InputShipmentIDs
        +bool IsDerivedProduct
        +FarmerData FarmerData
        +ProcessorData ProcessorData
        +DistributorData DistributorData
        +RetailerData RetailerData
        +RecallInfo RecallInfo
        +CertificationRecord[] CertificationRecords
        +HistoryEntry[] History
    }
    
    class FarmerData {
        +string FarmerID
        +string FarmerAlias
        +string FarmLocation
        +string CropType
        +time PlantingDate
        +time HarvestDate
        +string DestinationProcessorID
    }
    
    class ProcessorData {
        +string ProcessorID
        +string ProcessorAlias
        +time DateProcessed
        +string ProcessingType
        +string DestinationDistributorID
    }
    
    class DistributorData {
        +string DistributorID
        +string DistributorAlias
        +time PickupDateTime
        +string DestinationRetailerID
    }
    
    class RetailerData {
        +string RetailerID
        +string RetailerAlias
        +time DateReceived
        +string StoreLocation
    }
    
    class RecallInfo {
        +bool IsRecalled
        +string RecallID
        +string RecallReason
        +time RecallDate
        +string RecalledBy
        +string[] LinkedShipmentIDs
    }
    
    class CertificationRecord {
        +string CertifierID
        +string CertifierAlias
        +time InspectionDate
        +CertificationStatus Status
    }
    
    Shipment "1" --> "0..1" FarmerData
    Shipment "1" --> "0..1" ProcessorData
    Shipment "1" --> "0..1" DistributorData
    Shipment "1" --> "0..1" RetailerData
    Shipment "1" --> "1" RecallInfo
    Shipment "1" --> "*" CertificationRecord
    
    IdentityInfo "1" --> "*" Shipment : owns
```

## 10. Error Handling & Validation Flow

```mermaid
flowchart TB
    subgraph "Frontend Validation"
        style Frontend fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
        FV1[Form Validation]
        FV2[Display Error Messages]
        FV3[Retry Logic]
    end
    
    subgraph "Server Validation"
        style Server fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
        SV1[JWT Verification]
        SV2[Input Validation]
        SV3[Role Authorization]
        SV4[Rate Limiting]
        
        SE1[400 Bad Request]
        SE2[401 Unauthorized]
        SE3[403 Forbidden]
        SE4[429 Too Many Requests]
        SE5[500 Server Error]
    end
    
    subgraph "Chaincode Validation"
        style Chaincode fill:#fff3e0,stroke:#f57c00,stroke-width:2px
        CV1[Identity Validation]
        CV2[Role Validation]
        CV3[Status Validation]
        CV4[Ownership Validation]
        CV5[Business Logic Validation]
        
        CE1[Permission Denied]
        CE2[Invalid State]
        CE3[Not Found]
        CE4[Already Exists]
    end
    
    FV1 --> SV1
    SV1 -->|Invalid| SE2
    SV1 -->|Valid| SV2
    SV2 -->|Invalid| SE1
    SV2 -->|Valid| SV3
    SV3 -->|Unauthorized| SE3
    SV3 -->|Authorized| SV4
    SV4 -->|Rate Exceeded| SE4
    SV4 -->|OK| CV1
    
    CV1 --> CV2
    CV2 --> CV3
    CV3 --> CV4
    CV4 --> CV5
    
    CV1 -->|Failed| CE3
    CV2 -->|Failed| CE1
    CV3 -->|Failed| CE2
    CV4 -->|Failed| CE1
    CV5 -->|Failed| CE4
    
    SE1 --> FV2
    SE2 --> FV2
    SE3 --> FV2
    SE4 --> FV2
    SE5 --> FV2
    
    CE1 --> SE5
    CE2 --> SE5
    CE3 --> SE5
    CE4 --> SE5
    
    FV2 --> FV3
```

These Mermaid diagrams provide a comprehensive visualization of the FoodTrace system, clearly showing the separation between:
- **Frontend (Blue)**: React components and user interactions
- **Server/BFF (Green)**: Express API, authentication, and local database
- **Chaincode (Orange)**: Hyperledger Fabric smart contracts and blockchain logic

Each diagram focuses on a specific aspect of the system, making it easier to understand the complex interactions and data flows throughout the application.