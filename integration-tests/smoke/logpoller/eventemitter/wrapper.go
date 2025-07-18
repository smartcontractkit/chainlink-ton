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

// TODO: gobindings below should be in contracts/bindings/go,
// TODO: we should also consider separating go modules by production and test contracts

var EventEmitterPath = test_utils.GetBuildDir("examples.logpoller.event-emitter.compiled.json")

var (
	CounterIncreasedTopic uint32 = hash.CalcCRC32("CounterIncreased")
	CounterResetTopic     uint32 = hash.CalcCRC32("CounterReset")
)

type CounterIncreased struct {
	ID      uint64 `tlb:"## 64"`
	Counter uint64 `tlb:"## 64"`
}

type CounterReset struct {
	ID uint64 `tlb:"## 64"`
}

func DeployEventEmitterContract(ctx context.Context, client ton.APIClientWrapped, wallet *wallet.Wallet, id uint64) (*address.Address, error) {
	// TODO: any context is not being used in contract helpers
	sigClient := &tracetracking.SignedAPIClient{
		Client: client,
		Wallet: *wallet,
	}
	codeCell, cerr := wrappers.ParseCompiledContract(EventEmitterPath)
	if cerr != nil {
		return nil, fmt.Errorf("failed to parse compiled contract: %w", cerr)
	}

	contract, err := wrappers.Deploy(
		sigClient,
		codeCell,
		cell.BeginCell().
			MustStoreUInt(id, 64).
			MustStoreUInt(0, 64). // initial counter value
			EndCell(),
		tlb.MustFromTON("0.1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to deploy contract: %w", err)
	}

	return contract.Address, nil
}

func IncreaseCounterMsg(contractAddress *address.Address) *wallet.Message {
	msgBody := cell.BeginCell().
		MustStoreUInt(0x10000001, 32).    // IncreaseCounter op code
		MustStoreUInt(rand.Uint64(), 64). // queryId
		EndCell()

	msg := &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     contractAddress,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        msgBody,
		},
	}

	return msg
}

func ResetCounterMsg(contractAddress *address.Address) *wallet.Message {
	msgBody := cell.BeginCell().
		MustStoreUInt(0x10000002, 32).    // ResetCounter op code
		MustStoreUInt(rand.Uint64(), 64). // queryId
		EndCell()

	msg := &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     contractAddress,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        msgBody,
		},
	}

	return msg
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

func GetCounter(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddress *address.Address) (*big.Int, error) {
	res, err := client.RunGetMethod(ctx, block, contractAddress, "counter")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'counter': %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract counter value: %w", err)
	}

	return val, nil
}
