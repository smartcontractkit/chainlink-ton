package operation

import (
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

type TonDeps struct {
	TonChain         cldf_ton.Chain
	CCIPOnChainState map[uint64]state.CCIPChainState
}
