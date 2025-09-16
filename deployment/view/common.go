package view

const (
	versionGetter            = "typeAndVersion"
	allDestChainConfigGetter = "allDestChainConfigs"
)

// MetaData holds common metadata for all contract views.
type MetaData struct {
	Address      string `json:"address,omitempty"`
	ContractType string `json:"contractType,omitempty"`
	Version      string `json:"version,omitempty"`
}
