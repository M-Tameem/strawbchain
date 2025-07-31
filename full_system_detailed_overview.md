# Full System Technical Reference

This document dives into every component of the FoodTrace platform in detail. It is intended for engineers who need to understand how the pieces fit together.

## 1. Chaincode (`./chaincode`)

*Written in Go and built using Hyperledger Fabric contract API.*

### Major packages
- `model/` – Data structures such as `Shipment`, `FarmerData`, `ProcessorData`, `DistributorData`, `RetailerData`, and identity records.
- `contract/` – Smart contract logic split by role:
  - `shipment_farmer_ops.go` – create shipments and submit for certification.
  - `shipment_certifier_ops.go` – approve or reject certifications.
  - `shipment_processor_ops.go` – process shipments or transform multiple inputs.
  - `shipment_distributor_ops.go` – log transport data.
  - `shipment_retailer_ops.go` – receive shipments and mark them consumed.
  - `shipment_recall_ops.go` – initiate recalls and link related shipments.
  - `shipment_admin_ops.go` – archive/unarchive and other admin tasks.
  - `shipment_query_ops.go` – read-only helpers like `GetShipmentPublicDetails` and history retrieval.
  - `identity_manager.go` – utility for registering identities and assigning roles.
  - `shipment_helpers.go` – validation and shared helpers.
- `main.go` – Entrypoint that starts the chaincode container.

### Data model highlights
- `ShipmentStatus` enum defines lifecycle states from `CREATED` to `CONSUMED` and `RECALLED`.
- `Shipment` struct embeds all role-specific substructures and keeps a running history array.
- Each write operation validates inputs carefully (max length, required fields) and emits events for off-chain processing.
- Composite keys use the constant `Shipment` object type to allow rich CouchDB queries.

### Identity management
- Every Fabric identity is registered on-chain with a short alias.
- Roles (`farmer`, `processor`, `certifier`, `distributor`, `retailer`, `admin`) control access to contract methods.
- Admins can grant or remove roles, and all identities are queryable via `GetAllIdentities` or `GetAllAliases`.

## 2. BFF Server (`./application/server`)

*Node.js Express server that speaks to Kaleido's REST APIs.*

- Stores users in `foodtrace.db` (SQLite) with hashed passwords and mapping to Kaleido identities.
- `bootstrap.js` registers the initial admin identity on first run.
- `server.js` exposes REST endpoints under `/api/*` that mirror chaincode functions: creating shipments, processing, distributing, recalling and queries.
- Uses HTTPS requests (see `makeKaleidoRequest` in `server.js`) to send transactions to Kaleido's transaction service and to manage identities.
- Generates QR codes for public shipment pages and can upload certification files to IPFS.
- Environment variables in `.env` configure Kaleido hostnames, credentials and rate‑limit options.

## 3. Frontend (`./application/foodtrace-ledger-supply`)

*React + Vite + shadcn-ui.*

- Components in `src/` provide forms for each role (create shipment, certify, process, distribute, recall, etc.).
- React Query manages data fetching from the BFF server.
- Tailwind CSS provides styling. The build output is generated with `npm run build`.

## 4. Hyperledger Fabric Network

- Deployed via Kaleido: peers run the chaincode container built from the Go code above.
- An ordering service sequences transactions and stores blocks on the shared ledger.
- CouchDB acts as the state database for rich queries.
- The BFF authenticates to Kaleido using app credentials and identity service secrets.

## 5. Development and Build Steps

1. **Chaincode**
   ```bash
   go vet ./...
   go build ./...
   ```
2. **Server**
   ```bash
   cd application/server
   npm install
   npm build       # no-op (no build script)
   ```
3. **Frontend**
   ```bash
   cd application/foodtrace-ledger-supply
   npm install
   npm run build
   ```

## 6. Data Flow End to End

1. A user authenticates to the BFF server and obtains a JWT.
2. The frontend sends a REST call with that token to an API endpoint such as `/api/shipments`.
3. The server forwards the request to Kaleido's transaction endpoint which invokes the chaincode function.
4. Chaincode validates the caller's role, updates the shipment record, writes to CouchDB and emits an event.
5. The server returns the result to the frontend for display.

## 7. Recall Propagation

- When `InitiateRecall` is called, the chaincode sets `RecallInfo.isRecalled` on the target shipment and stores the reason.
- `AddLinkedShipmentsToRecall` accepts a list of related shipment IDs, marking them recalled as well.
- Queries such as `GetShipmentPublicDetails` reveal recall status so the UI can warn end users.

## 8. Diagrams

See `shipment_routes_diagrams.md` for lifecycle, architecture and data model visuals. These diagrams are suitable for presentations at varying levels of depth.

