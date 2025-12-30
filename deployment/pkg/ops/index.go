package ops

import (
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/operation"
)

var (
	AllOperations = []*operations.Operation[any, any, any]{
		opston.SendMessages.AsUntyped(),

		// TODO: refactor ops below
		operation.DeployTONContractOp.AsUntyped(),
		operation.DownloadArtifactsOp.AsUntyped(),
	}
	// Registry is the (default) operations registry for available TON operations.
	Registry = operations.NewOperationRegistry(AllOperations...)
)
