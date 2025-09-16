package view

import "github.com/xssnick/tonutils-go/address"

const (
	versionGetter         = "typeAndVersion"
	destChainsGetter      = "destChainSelectors"
	destChainConfigGetter = "destChainConfig"
)

// MetaData holds common metadata for all contract views.
type MetaData struct {
	Address      *address.Address `json:"address,omitempty"`
	ContractType string           `json:"contractType,omitempty"`
	Version      string           `json:"version,omitempty"`
}
