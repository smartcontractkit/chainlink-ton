package counter

import (
	"context"
	"fmt"
	"math/big"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/contract"

	"github.com/smartcontractkit/chainlink-ton/testutils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var COUNTER_CONTRACT_PATH = testutils.GetBuildDir("Counter.compiled.json")

type CounterConfig struct {
	ID    *big.Int
	Count *big.Int
}

// Creates StateInit and computes address
func BuildCounterStateInit(ctx context.Context, config CounterConfig) (*address.Address, *cell.Cell, error) {
	code, err := contract.ParseCompiledContract(COUNTER_CONTRACT_PATH)
	if err != nil {
		return nil, nil, fmt.Errorf("Failed to compile contract: %v", err)
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

func IncrementPayload(queryId uint64) (*cell.Cell, error) {
	msg := cell.BeginCell().
		MustStoreUInt(4, 32).      // opcode
		MustStoreUInt(queryId, 64) // query_id
	return msg.EndCell(), nil
}

func IncrementMultPayload(queryId uint64, a uint32, b uint32) (*cell.Cell, error) {
	msg := cell.BeginCell().
		MustStoreUInt(5, 32).       // opcode
		MustStoreUInt(queryId, 64). // query_id
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
