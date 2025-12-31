package ton // alias: opston

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var (
	_ codec.Resolver[ton.ContractMetadata, *cell.Cell] = contractCellResolver{}
)

type contractCellResolver struct {
	provider ton.ContractProvider
}

func NewContractCellResolver(provider ton.ContractProvider) codec.Resolver[ton.ContractMetadata, *cell.Cell] {
	return contractCellResolver{provider: provider}
}

func (r contractCellResolver) Resolve(in ton.ContractMetadata) (*cell.Cell, error) {
	contract, err := r.provider.GetContract(in)
	if err != nil {
		return nil, fmt.Errorf("failed to get contract: %w", err)
	}
	return contract.Code, nil
}
