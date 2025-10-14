package v160

import (
	ccipapi "github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	cldfChain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldfOps "github.com/smartcontractkit/chainlink-deployments-framework/operations"
)

func (a *TonAdapter) ConfigureLaneLegAsSource() *cldfOps.Sequence[ccipapi.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return nil // Not implemented for Ton
}

func (a *TonAdapter) ConfigureLaneLegAsDest() *cldfOps.Sequence[ccipapi.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return nil // Not implemented for Ton
}
