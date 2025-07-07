package counterlegacy

import (
	"context"
	"fmt"
	"math/big"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var CounterContractPath = test_utils.GetBuildDir("CounterLegacy/tact_CounterLegacy.pkg")

type CounterConfig struct {
	ID    *big.Int
	Count *big.Int
}

// Creates StateInit and computes address
func BuildCounterStateInit(config CounterConfig) (*address.Address, *cell.Cell, error) { //TODO: @briansztamfater ctx is not in use
	code, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to compile contract: %w", err)
	}

	data := cell.BeginCell().
		MustStoreUInt(0, 1).
		MustStoreBigInt(config.ID, 257).
		MustStoreBigInt(config.Count, 257).
		EndCell()

	stateInit := &tlb.StateInit{
		Code: code,
		Data: data,
	}

	stateInitCell, err := tlb.ToCell(stateInit)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to build state init: %w", err)
	}

	contractAddr := address.NewAddress(0, 0, stateInitCell.Hash())

	return contractAddr, stateInitCell, nil
}

func IncrementPayload(queryID uint64) (*cell.Cell, error) {
	msg := cell.BeginCell().
		MustStoreUInt(4, 32).      // opcode
		MustStoreUInt(queryID, 64) // query_id
	return msg.EndCell(), nil
}

func IncrementMultPayload(queryID uint64, a uint32, b uint32) (*cell.Cell, error) {
	msg := cell.BeginCell().
		MustStoreUInt(5, 32).       // opcode
		MustStoreUInt(queryID, 64). // query_id
		MustStoreUInt(uint64(a), 32).
		MustStoreUInt(uint64(b), 32)
	return msg.EndCell(), nil
}

func GetCount(ctx context.Context, api *ton.APIClient, addr *address.Address) (uint64, error) {
	block, err := api.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("CurrentMasterchainInfo err: %w", err)
	}

	res, err := api.RunGetMethod(ctx, block, addr, "count")
	if err != nil {
		return 0, fmt.Errorf("get count failed: %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return 0, fmt.Errorf("invalid stack response: %w", err)
	}

	return val.Uint64(), nil
}
