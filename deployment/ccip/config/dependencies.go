package config

import (
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

// TODO (ops): use DependencyProvider to provide these deps where needed
type CCIPDeps struct {
	TonChain         cldf_ton.Chain
	CCIPOnChainState map[uint64]state.CCIPChainState
}
