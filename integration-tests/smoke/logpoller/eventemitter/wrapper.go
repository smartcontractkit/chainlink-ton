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

func DeployEventEmitterContract(ctx context.Context, client ton.APIClientWrapped, wallet *wallet.Wallet, destChainSelector uint64) (*address.Address, error) {
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
			MustStoreUInt(destChainSelector, 64).
			MustStoreUInt(0, 64).
			EndCell(), tlb.MustFromTON("0.1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to deploy contract: %w", err)
	}

	return contract.Address, nil
}

func CCIPSendMessage(contractAddress *address.Address) *wallet.Message {
	msgBody := cell.BeginCell().
		MustStoreUInt(0x00000001, 32). // CCIPSend op code
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

func ResetMessage(contractAddress *address.Address) *wallet.Message {
	msgBody := cell.BeginCell().
		MustStoreUInt(0x00000002, 32). // Reset op code
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

func GetDestinationChain(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddress *address.Address) (*big.Int, error) {
	res, err := client.RunGetMethod(ctx, block, contractAddress, "destChainSelector")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'destChainSelector': %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract destChainSelector value: %w", err)
	}

	return val, nil
}

func GetSequenceNumber(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddress *address.Address) (*big.Int, error) {
	res, err := client.RunGetMethod(ctx, block, contractAddress, "sequenceNumber")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'sequenceNumber': %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract sequenceNumber value: %w", err)
	}

	return val, nil
}
