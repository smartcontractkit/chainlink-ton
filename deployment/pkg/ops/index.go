package ops

import (
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/lib/versioning/upgradeable"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/operation"
)

var (
	// Notice: AsUntypedRelaxed is used to preserve op.IN type information in the registry,
	// which allows relaxed (e.g., generic map[string]interface{}) input unmarshaling.
	AllOperations = []*operations.Operation[any, any, any]{
		ton.SendMessages.AsUntypedRelaxed(),
		ton.Deploy.AsUntypedRelaxed(),
		upgradeable.Upgrade.AsUntypedRelaxed(),

		// TODO (ops): refactor ops below
		operation.DeployTONContractOp.AsUntypedRelaxed(),

		// MCMS operations
		mcms.SetConfig.AsUntypedRelaxed(),
	}

	// Registry is the (default) operations registry for available TON operations.
	Registry = operations.NewOperationRegistry(AllOperations...)
)
