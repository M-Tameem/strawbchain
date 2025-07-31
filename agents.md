This is the official spec of the application:
Structural considerations in Hyperledger Fabric
These foundational components support the entire system:
• MSP – Manages identities and access per organization (e.g., farmers, distributors).
• Peers – Host chaincode and maintain ledger copies. Each organization can run its own
peer.
• Ordering Service – Ensures proper transaction ordering.
• Channels – Segment private vs public information.
• Smart Contracts (Chaincode) – Enforce organic certification rules, processing logic, and
traceability recordkeeping.
• Ledger – Holds the transaction history for each product journey from farm to fork.
Stakeholder Key features Dashboard
components
Attributes
Farmer • GPS-based
origin, farming
method, digital
identity,
certification
upload
• "Add New Crop
Batch" form
• Certification upload
interface
• GPS field location
picker (map API)
1. farmerID – from blockchain
identity
2. name – farmer’s full name
3. farmLocation – use google
maps/Leaflet inputs
4. cropType – organic crop name
5. plantingDate – date field
6. fertilizeUsed – must comply
with organic rules
7. certificationDoc – pdf upload
(hash stored on blockchain
8. harvestDate – for traceability
9. batchID – auto-generated
Processor • Batch ID
tracking,
contamination
logs, quality
control records
• "Receive Batch"
interface (scan QR or
enter ID)
• "Process Batch" with
transformation logs
1. processorID – fabric identity
2. batchReceived – ID of batch
being processed
3. processingType – Eg. Washing,
drying, packaging
4. processingDate – make it as
required field
5. contaminationCheck –
pass/fail
6. processBatchId – new batch ID
post-processing
Certifier (organic
authorities)
• Upload & verify
organic
certifications,
endorse
products
• "View Pending
Batches for
Approval"
• "Approve/Reject
Certification"
1. certifierID – blockchain
identity
2. batchID – batch being certified
3. inspectionDate – when
inspection was performed
4. inspectionReport – PDF or
images, hashed to blockchain
5. status –
approved/rejected/pending
6. comments – optional remarks
by inspector
Distributor/Logistics • Shipping
records,
handling
conditions (IoT
integration),
timestamps
• "Pick Up Batch"
• "Log Transportation
Conditions"
1. distributorID – blockchain
identity
2. batchID – batch in transit
3. pickupDateTime – start of
shipment
4. deliveryDateTime – end of
shipment
5. temperatureRange – manual
or IoT-fed
6. transitLocationLog – optional
GPS waypoints or logs
Retailer • Shelf info, QR
code visibility,
consumer
interaction
• "Receive Product"
• "Generate QR Code
for Display"
1. retailerID – blockchain identity
2. batchID – batch received
3. productName – retail-facing
label
4. shelfLife – sell-by and expiry
dates
5. storeLocation – address or
map-based
6. price – optional for display
7. qrCodeLink – auto-generated
from batch trace hash
Consumer (optional
read-only interface)
• QR code scan
to view product
journey,
certification
transparency
• QR code scanner or
manual lookup
• Product history
viewer (farm to
fork)
1. productID – derived from
batchID
2. originFarm – pulled from trace
data
3. certificationStatus –
Approved/rejected
4. processingDetails – type, date,
processor name
5. shippingInfo – dates, location
6. retailerInfo – name, price,
location
7. qrScanTime – optional for
analytics

Instructions:
When ready to test, always npm install before running npm build, **do not npm test**. Always run go build/go vet. 
Kaleido has a very strict JSON schema and messing it up can mean a major refactor. Be very thorough with how json payloads are structured and ensure they are consistent across all files.
Additionally, **ensure** that features are added end-to-end, on chaincode, server, and frontend, in modular fashion.