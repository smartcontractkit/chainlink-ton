package operation

import (
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview"
)

type TonDeps struct {
	TonChain         cldf_ton.Chain
	CCIPOnChainState stateview.CCIPOnChainState
}
