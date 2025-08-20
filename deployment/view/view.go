package view

import "github.com/smartcontractkit/chainlink/deployment/ccip/view/aptos"

type TonChainView struct {
	ChainSelector uint64 `json:"chainSelector,omitempty"`
	ChainID       string `json:"chainID,omitempty"`

	MCMSWithTimelock MCMSWithTimelockView `json:"mcmsWithTimelock,omitempty"`

	LinkToken aptos.TokenView            `json:"linkToken,omitempty"`
	Tokens    map[string]aptos.TokenView `json:"tokens,omitempty"`

	CCIP    aptos.CCIPView               `json:"ccip,omitempty"`
	Router  map[string]aptos.RouterView  `json:"router,omitempty"`
	OnRamp  map[string]aptos.OnRampView  `json:"onRamp,omitempty"`
	OffRamp map[string]aptos.OffRampView `json:"offRamp,omitempty"`

	TokenPools map[string]map[string]aptos.TokenPoolView `json:"poolByTokens,omitempty"` // TokenSymbol => TokenPool Address => PoolView

	UpdateMu *sync.Mutex `json:"-"`
}

func NewTonChainView() TonChainView {
	return TonChainView{
		ChainSelector:    0,
		ChainID:          "",
		MCMSWithTimelock: aptos.MCMSWithTimelockView{},
		LinkToken:        aptos.TokenView{},
		Tokens:           make(map[string]aptos.TokenView),
		CCIP:             aptos.CCIPView{},
		Router:           make(map[string]aptos.RouterView),
		OnRamp:           make(map[string]aptos.OnRampView),
		OffRamp:          make(map[string]aptos.OffRampView),
		TokenPools:       make(map[string]map[string]aptos.TokenPoolView),
		UpdateMu:         &sync.Mutex{},
	}
}
