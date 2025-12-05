package config

import (
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

type MCMSDeps struct {
	TonChain       cldf_ton.Chain
	MCMSChainState map[uint64]state.MCMSChainState
}
