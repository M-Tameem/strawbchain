# FoodTrace Blockchain Overview

This repository implements an end-to-end food supply chain tracing system built on Hyperledger Fabric. The solution is composed of three major parts:

1. **Chaincode** (`./chaincode`)
   - Smart contract written in Go.
   - Manages shipment lifecycle, organic certifications, processing, distribution, retail events and recall operations.
   - Provides identity management utilities so each organization can register identities and assign roles.
   - Persists all shipment data on the Fabric ledger.

2. **BFF Server** (`./application/server`)
   - Node.js/Express backend acting as the gateway between the frontend and the blockchain network.
   - Handles user authentication via JWT and stores user accounts in SQLite.
   - Wraps Kaleido identity and transaction service calls so the frontend never talks to Fabric directly.

3. **Frontend** (`./application/foodtrace-ledger-supply`)
   - Vite + React application providing forms and dashboards for every supply-chain actor.
   - Communicates only with the BFF server through HTTPS APIs.

Typical flow of a shipment:

1. Farmer uses the UI to create a new shipment. The BFF calls the chaincode `CreateShipment` method.
2. Certifier records an organic certification using `RecordCertification`.
3. Processor marks the shipment processed and may transform multiple inputs into new products.
4. Distributor logs transport events.
5. Retailer receives the shipment and can optionally mark it as sold/consumed.
6. At any point an admin may initiate a recall which propagates to all related shipments.

The `shipment_routes_diagrams.md` file contains several Mermaid diagrams that visualize these flows.

For build and testing, run `go vet` and `go build` under `chaincode/`. For the Node projects run `npm install` followed by `npm run build` (frontend) or `npm build` (server, no build script is defined).
