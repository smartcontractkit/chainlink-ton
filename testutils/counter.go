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

// Replace this with your real contract code BOC
func getCounterContractCode() *cell.Cell {
	hexBOC := "b5ee9c7241021601000250000228ff008e88f4a413f4bcf2c80bed5320e303ed43d9011402027102040149beffe76a268690000cbe98fe98facb6094f408080eb80408080eb802c816880f16d9e3610c030002200201200512020120060b02012007090149b3ae7b513434800065f4c7f4c7d65b04a7a0404075c020404075c01640b44078b6cf1b0860080004f82a0149b3643b513434800065f4c7f4c7d65b04a7a0404075c020404075c01640b44078b6cf1b08600a0002210149b7fadda89a1a400032fa63fa63eb2d8253d020203ae01020203ae00b205a203c5b678d84300c042cc86f00016f8c6d6f8c59db3c13db3c8b220768db3c020d10100e004a8d0898dbdb4b98da185a5b9b1a5b9acb9d1bdb8b995e185b5c1b195ccb90dbdd5b9d195ca00230db3c13db3c6f2201c993216eb396016f2259ccc9e831d0120f10000e8b5312e302e3080104db3c1100b620d74a21d7499720c20022c200b18e48036f22807f22cf31ab02a105ab025155b60820c2009a20aa0215d71803ce4014de596f025341a1c20099c8016f025044a1aa028e123133c20099d430d020d74a21d749927020e2e2e85f030149ba8aced44d0d2000197d31fd31f596c129e810101d700810101d7005902d101e2db3c6c218130008f82af90001f43001d072d721d200d200fa4021103450666f04f86102f862ed44d0d2000197d31fd31f596c129e810101d700810101d7005902d101e203925f03e001d70d1ff2e08221c0048e115b01a4c87f01ca005902cb1fcb1fc9ed54e001c0058e19d33f31d31fd31f30a812a0c87f01ca005902cb1fcb1fc9ed54e05f03150006f2c08231fcafb7" // Output from tact compile + FromTVC
	codeCellBytes, _ := hex.DecodeString(hexBOC)

	codeCell, err := cell.FromBOC(codeCellBytes)
	if err != nil {
		panic(err)
	}

	return codeCell
}

// Optional: init data builder (counter ID and count)
func getCounterData(id, count *big.Int) *cell.Cell {
	c := cell.BeginCell()
	c.MustStoreUInt(0, 1) // discriminator bit to match Tact
	c.MustStoreBigInt(id, 257)
	c.MustStoreBigInt(count, 257)
	return c.EndCell()
}

// Creates StateInit and computes address
func DeployCounterContract(ctx context.Context, api *ton.APIClient, wallet *wallet.Wallet) (*address.Address, *cell.Cell, error) {
	code := getCounterContractCode()
	data := getCounterData(big.NewInt(1337), big.NewInt(0)) // ID: 1337, initial count: 0

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

func EncodeIncrement(queryId uint64) (*cell.Cell, error) {
	msg := cell.BeginCell().
		MustStoreUInt(4, 32).      // opcode
		MustStoreUInt(queryId, 64) // query_id
	return msg.EndCell(), nil
}

func EncodeIncrementMult(queryId uint64, a uint32, b uint32) (*cell.Cell, error) {
	msg := cell.BeginCell().
		MustStoreUInt(5, 32).       // opcode
		MustStoreUInt(queryId, 64). // query_id
		MustStoreUInt(uint64(a), 32).
		MustStoreUInt(uint64(b), 32)
	return msg.EndCell(), nil
}

func ReadCounter(ctx context.Context, api *ton.APIClient, addr *address.Address) (uint64, error) {
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
