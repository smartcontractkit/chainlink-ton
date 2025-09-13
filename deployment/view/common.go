package view

const (
	destChainGetter       = "destChainSelectors"
	destChainConfigGetter = "destChainConfig"
)

type metaData struct {
	Address      string `json:"address,omitempty"`
	ContractType string `json:"contractType,omitempty"`
	Version      string `json:"version,omitempty"`
}
