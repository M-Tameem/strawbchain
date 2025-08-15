// Author: Muhammad-Tameem Mughal
// Last updated: Aug 15, 2025
// Last modified by: Muhammad-Tameem Mughal

package main

import (
	"foodtrace/contract"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&contract.FoodtraceSmartContract{})
	if err != nil {
		panic("Error creating FoodtraceSmartContract: " + err.Error())
	}
	if err := cc.Start(); err != nil {
		panic("Error starting chaincode: " + err.Error())
	}
}
