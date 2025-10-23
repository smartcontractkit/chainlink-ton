package view

import (
	"github.com/xssnick/tonutils-go/address"
)

// MetaData holds common metadata for all contract views.
type MetaData struct {
	Address      *address.Address `json:"address,omitempty"`
	ContractType string           `json:"contractType,omitempty"`
	Version      string           `json:"version,omitempty"`
}
