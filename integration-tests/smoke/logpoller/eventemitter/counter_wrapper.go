package eventemitter

import (
	"context"
	"fmt"
	"math/big"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

// TODO: gobindings below should be in contracts/bindings/go,... or pkg/bindings/examples? but it doens't need to be packaged
// TODO: we should also consider separating go modules by production and test contracts

var EventEmitterPath = test_utils.GetBuildDir("examples.counter.compiled.json")

var (
	CountIncreasedTopic uint32 = hash.CalcCRC32("CountIncreased")
)

type CountIncreased struct {
	ID    uint32 `tlb:"## 32"`
	Value uint32 `tlb:"## 32"`
}

func DeployCounterContract(client ton.APIClientWrapped, wallet *wallet.Wallet, id uint32) (*address.Address, error) {
	codeCell, cerr := wrappers.ParseCompiledContract(EventEmitterPath)
	if cerr != nil {
		return nil, fmt.Errorf("failed to parse compiled contract: %w", cerr)
	}

	// TODO: any context is not being used in contract helpers
	sigClient := &tracetracking.SignedAPIClient{
		Client: client,
		Wallet: *wallet,
	}

	contract, err := wrappers.Deploy(
		sigClient,
		codeCell,
		cell.BeginCell().
			MustStoreUInt(uint64(id), 32).
			MustStoreUInt(0, 32). // initial value as zero
			EndCell(),
		tlb.MustFromTON("0.1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to deploy contract: %w", err)
	}

	return contract.Address, nil
}

func SetCountMsgBody(newCount uint32) *cell.Cell {
	return cell.BeginCell().
		MustStoreUInt(0x10000004, 32).    // SetCount op code
		MustStoreUInt(rand.Uint64(), 64). //nolint:gosec // test queryId
		MustStoreUInt(uint64(newCount), 32).
		EndCell()
}

func IncreaseCountMsgBody() *cell.Cell {
	return cell.BeginCell().
		MustStoreUInt(0x10000005, 32).    // IncreaseCounter op code
		MustStoreUInt(rand.Uint64(), 64). //nolint:gosec // test queryId
		EndCell()
}

func GetID(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddress *address.Address) (*big.Int, error) {
	res, err := client.RunGetMethod(ctx, block, contractAddress, "id")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'id': %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract id value: %w", err)
	}

	return val, nil
}

func GetValue(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddress *address.Address) (*big.Int, error) {
	res, err := client.RunGetMethod(ctx, block, contractAddress, "value")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'value': %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract value value: %w", err)
	}

	return val, nil
}
