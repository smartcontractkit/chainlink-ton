package testutils

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// TODO: remove all, contract utils should be fed via contract wrappers
func DeployCounterContract(ctx context.Context, client ton.APIClientWrapped, wallet *wallet.Wallet) (*address.Address, error) {
	addr, _, _, err := wallet.DeployContractWaitTransaction(
		ctx,
		tlb.MustFromTON("0.2"),
		cell.BeginCell().EndCell(),
		getTestContractCode(),
		// contract init data
		cell.BeginCell().
			MustStoreAddr(wallet.WalletAddress()).
			MustStoreUInt(0, 32).
			EndCell(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to deploy counter contract: %w", err)
	}

	return addr, nil
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

// getters
func GetCounterValue(ctx context.Context, client ton.APIClientWrapped, contractAddress *address.Address) (*big.Int, error) {
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

func getTestContractCode() *cell.Cell {
	var hexBOC = "b5ee9c7241010a0100f6000114ff00f4a413f4bcf2c80b0102016202070202cd0306020120040500e34eda2edfbed44d0fa4001f861d31f30f86201d0d30331fa4030f8415210c7058e3021c70091318e2801d31f3082103dc2af2dba8e1a70f862c8f841cf16f84201cb1fc9ed548103e9f82358f003db31e0e29131e2f842a4f862c8f841cf16f84201cb1fc9ed548103eaf823f8425502f0048003158208630000c8cb1613cbf770cf0b61cb1f01cf16c970fb0080037d410431800064658b0a65fbb86785b089658fe58f80e78b64b87d80402012008090023be28ef6a2687d2000fc30e98f987c317c20c0023bcd0c76a2687d2000fc30e98f987c317c2146be57319"
	codeCellBytes, _ := hex.DecodeString(hexBOC)

	codeCell, err := cell.FromBOC(codeCellBytes)
	if err != nil {
		panic(err)
	}

	return codeCell
}

// TODO: temp, useful for mocking events in unit tests
// func createResetEventCell(resetBy *address.Address) *cell.Cell {
// 	return cell.BeginCell().
// 		MustStoreUInt(0x1001, 16).     // Magic #1001
// 		MustStoreUInt(1234567890, 32). // Timestamp
// 		MustStoreAddr(resetBy).        // ResetBy address
// 		EndCell()
// }

// func createIncrementEventCell(triggeredBy *address.Address) *cell.Cell {
// 	return cell.BeginCell().
// 		MustStoreUInt(0x1002, 16).     // Magic #1002
// 		MustStoreUInt(1234567890, 32). // Timestamp
// 		MustStoreUInt(42, 32).         // NewValue
// 		MustStoreAddr(triggeredBy).    // TriggeredBy address
// 		EndCell()
// }
