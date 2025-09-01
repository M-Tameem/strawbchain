Author: Muhammad-Tameem Mughal
Last updated: Aug 15, 2025
Last modified by: Muhammad-Tameem Mughal

# StrawbChain Blockchain Overview

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

For build and testing, run `go vet` and `go build` under `chaincode/`. To create the final bin file for upload to Kaleido, run:
GOOS=linux GOARCH=amd64 go build -o foodtrace.bin

For the Node projects run `npm install` followed by `npm run build` (frontend) - for the server, please use node start.js to run locally.

For running, please ensure a .env file is placed in the 'application/server' directory, please see env-example.txt


## Known bugs:
The transform and create product functionality occasionally doesn't work - I couldn't figure out why unfortunately.
While the code is optimized for usage with CouchDB, there is no config file option for it in Kaleido, which doesn't allow those optimizations to be utilized adequately.

## How to use the IoT Server endpoint:
Currently, it isn't production ready, fully. What it does is traverse through the existing database, since it's supposed to have only one Distributor in the demo signup, and assigns the sensor to that Distributor's identity. Scaling this to a production level is relatively easy, however, without a dedicated IoT device, it does seem unnecessary to implement in full.

To use the endpoint, process a shipment to the Distributor level
Then, navigate to application/server and run "node test-sensor-logs.js <SHIP-ID>"
When you attempt to distribute the shipment in full, it will load the stored coordinates and related data as submitted from the sensor, and will be otherwise immutable on the client side.

## Common pitfalls during development:
Kaleido is VERY specific with it's schema, do NOT, under any circumstance, use 'omitempty' in any of the Go structs, Kaleido will complain. This would not be an issue in a manual deployment
Be super careful with losing your .db file during deployment, you will have to rebuild the Kaleido network from scratch to redeploy to Kaleido, as the db contains Kaleido network specific credentials.