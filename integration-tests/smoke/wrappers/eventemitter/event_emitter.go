package eventemitter

import (
	"context"
	"fmt"
	"math/big"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

// TODO: gobindings below should be in contracts/bindings/go,
// TODO: we should also consider separating go modules by production and test contracts

var EventEmitterPath = test_utils.GetBuildDir("examples.logpoller.event-emitter.compiled.json")

func DeployCounterContract(ctx context.Context, client ton.APIClientWrapped, wallet *wallet.Wallet) (*address.Address, error) {
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
			MustStoreAddr(wallet.WalletAddress()).
			MustStoreUInt(0, 32).
			EndCell(), tlb.MustFromTON("0.1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to deploy contract: %w", err)
	}

	return contract.Address, nil
}

func IncrementMessage(contractAddress *address.Address) *wallet.Message {
	msgBody := cell.BeginCell().
		MustStoreUInt(0x12345678, 32). // Any non-reset op code
		MustStoreUInt(0, 64).          // Query ID
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

const OpResetCounter = 0x3dc2af2d

func ResetMessage(contractAddress *address.Address) *wallet.Message {
	msgBody := cell.BeginCell().
		MustStoreUInt(OpResetCounter, 32). // Reset op code
		MustStoreUInt(0, 64).              // Query ID
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

func GetCounterValue(ctx context.Context, client ton.APIClientWrapped, contractAddress *address.Address) (*big.Int, error) {
	// TODO: for contract getters, probably it would be better to have master chain block as a parameter
	b, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	res, err := client.RunGetMethod(ctx, b, contractAddress, "counter")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'counter': %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract counter value: %w", err)
	}

	return val, nil
}

func GetOwner(ctx context.Context, client ton.APIClientWrapped, contractAddress *address.Address) (*address.Address, error) {
	b, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	res, err := client.RunGetMethod(ctx, b, contractAddress, "owner")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'owner': %w", err)
	}

	addrSlice, err := res.Slice(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract owner address slice: %w", err)
	}

	addr, err := addrSlice.LoadAddr()
	if err != nil {
		return nil, fmt.Errorf("failed to load owner address: %w", err)
	}

	return addr, nil
}
