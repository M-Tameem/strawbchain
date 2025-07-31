// File: model/identities.go
package model

import "time"

// IdentityInfo stores information about registered participants in the system.
type IdentityInfo struct {
	ObjectType      string    `json:"objectType"`      // Set to the composite key object type (IdentityInfo)
	FullID          string    `json:"fullId"`          // Full X.509 identity string
	ShortName       string    `json:"shortName"`       // Alias/short name for this identity
	EnrollmentID    string    `json:"enrollmentId"`    // EnrollmentID from certificate or registration
	OrganizationMSP string    `json:"organizationMsp"` // MSP ID of the organization
	Roles           []string  `json:"roles"`           // List of roles assigned to this identity
	IsAdmin         bool      `json:"isAdmin"`         // Whether this identity has admin privileges
	RegisteredBy    string    `json:"registeredBy"`    // Full ID of identity that registered this one
	RegisteredAt    time.Time `json:"registeredAt"`    // Timestamp when identity was registered
	LastUpdatedAt   time.Time `json:"lastUpdatedAt"`   // Timestamp of last update to this record
}
