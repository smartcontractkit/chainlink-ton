package testutils

import (
	"context"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const (
	OpResetCounter = 0x3dc2af2d
)

func IncrementCounterMessage(contractAddress *address.Address) *wallet.Message {
	msgBody := cell.BeginCell().
		MustStoreUInt(0x12345678, 32). // Any op code (not reset)
		MustStoreUInt(0, 64).          // queryId
		EndCell()

	return &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     contractAddress,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        msgBody,
		},
	}
}

func ResetCounterMessage(contractAddress *address.Address) *wallet.Message {
	msgBody := cell.BeginCell().
		MustStoreUInt(uint64(OpResetCounter), 32). // op_reset_counter
		MustStoreUInt(0, 64).                      // queryId
		EndCell()

	return &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     contractAddress,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        msgBody,
		},
	}
}

// GetCounterValue queries the current counter value
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

// GetOwner queries the contract owner
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
