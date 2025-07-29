package ops

import (
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
)

type AddLaneCfg struct {
	FromChainSelector uint64
	ToChainSelector   uint64
	FromFamily        string
	ToFamily          string
}

type AddTonLanes struct{}

var _ cldf.ChangeSetV2[AddLaneCfg] = AddTonLanes{}

func (cs AddTonLanes) VerifyPreconditions(_ cldf.Environment, _ AddLaneCfg) error {
	// TODO: Implement precondition checks for adding or updating a lane on Ton chain
	return nil
}

func (cs AddTonLanes) Apply(_ cldf.Environment, _ AddLaneCfg) (cldf.ChangesetOutput, error) {
	// TODO: Implement logic of adding or updating a lane on Ton chain
	return cldf.ChangesetOutput{}, nil
}
