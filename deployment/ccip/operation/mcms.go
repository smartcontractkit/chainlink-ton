package operation

import (
	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"
)

// SetConfigMCMSOp configures MCMS contract on Ton chain
var SetConfigMCMSOp = operations.NewOperation(
	"configure-mcms-op",
	semver.MustParse("0.1.0"),
	"Configure MCMS Contract Operation for Aptos Chain",
	deployMCMS,
)

func deployMCMS(b operations.Bundle, deps TonDeps, _ operations.EmptyInput) (*address.Address, error) {
	// TODO: implement MCMS deployment for TON
	return nil, nil
}
