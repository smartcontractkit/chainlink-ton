package operation

import (
	"encoding/hex"
	"fmt"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"math/big"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployTimelockInput struct {
	ID           uint32
	MinDelay     uint64
	ContractPath string
	Coins        string
}

type DeployTimelockOutput struct {
	Address *address.Address
}

type InitTimelockInput struct {
	Admin      *address.Address
	Proposers  []*address.Address
	Executors  []*address.Address
	Cancellers []*address.Address
	Bypassers  []*address.Address
}

var DeployTimelockOp = operations.NewOperation(
	"deploy-timelock-op",
	semver.MustParse("0.1.0"),
	"Deploys the Timelock contract",
	deployTimelock,
)

var InitTimelockOp = operations.NewOperation(
	"init-timelock-op",
	semver.MustParse("0.1.0"),
	"Init Timelock contract",
	initTimelock,
)

func deployTimelock(b operations.Bundle, deps TonDeps, in DeployTimelockInput) (DeployTimelockOutput, error) {
	output := DeployTimelockOutput{}

	codeCell, err := wrappers.ParseCompiledContract(in.ContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := timelock.Data{
		ID:                       10, // in.ID,
		MinDelay:                 0,  // in.MinDelay
		Timestamps:               cell.NewDict(256),
		BlockedFnSelectorsLen:    0,
		BlockedFnSelectors:       cell.NewDict(32),
		ExecutorRoleCheckEnabled: true,
		OpPendingInfo: timelock.OpPendingInfo{
			ValidAfter:            0,
			OpFinalizationTimeout: 0,
			OpPendingID:           big.NewInt(0),
		},
		RBAC: rbac.Data{
			Roles: cell.NewDict(256),
		},
	}

	//bocHex := "b5ee9c724101020100430001790000000a0000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001001000140b83e30a7"
	//data, err := hex.DecodeString(bocHex)
	//root, err := cell.FromBOC(data)
	//if err != nil {
	//	panic(err)
	//}
	//
	//fmt.Println("Bits:", root.BitsSize())
	//fmt.Println("Refs:", root.RefsNum())

	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	b.Logger.Infow("Original", "size", initData.BitsSize(), "hash", hex.EncodeToString(initData.Hash()), "size", initData.BitsSize())

	recovered, err := cell.FromBOC(initData.ToBOC())
	if err != nil {
		panic(err)
	}

	b.Logger.Infow("Original", "size", recovered.BitsSize(), "hash", hex.EncodeToString(recovered.Hash()), "size", recovered.BitsSize())

	body := timelock.TopUp{
		QueryID: 10,
	}
	bodyCell, err := tlb.ToCell(body)
	if err != nil {
		return output, fmt.Errorf("failed to pack body: %w", err)
	}

	b.Logger.Infow("body", "size", bodyCell.BitsSize(), "hash", hex.EncodeToString(bodyCell.Hash()))

	contract, _, err := wrappers.Deploy2(
		b.Logger,
		&conn,
		codeCell,
		initData,
		tlb.MustFromTON(in.Coins),
		bodyCell,
	)
	if err != nil {
		return output, fmt.Errorf("failed to deploy timelock contract: %w", err)
	}
	b.Logger.Infow("Deployed Timelock", "addr", contract.Address, "deployer wallet addr", deps.TonChain.WalletAddress.String())

	// Account ingo
	mcInfo, err := deps.TonChain.Client.CurrentMasterchainInfo(b.GetContext())
	if err != nil {
		panic(err)
	}
	acc, err := deps.TonChain.Client.GetAccount(b.GetContext(), mcInfo, contract.Address)
	if err != nil {
		b.Logger.Errorw("Error getting account state", "addr", contract.Address, "error", err)
	} else {
		b.Logger.Infow("Account data", "data hash", hex.EncodeToString(acc.Data.Hash()), "size", acc.Data.BitsSize())
	}

	output.Address = contract.Address
	return output, nil
}

func initTimelock(b operations.Bundle, deps TonDeps, in InitTimelockInput) ([][]byte, error) {
	timelockAddress := deps.CCIPOnChainState[deps.TonChain.Selector].Timelock

	init := timelock.Init{
		Admin:                    in.Admin,
		Proposers:                common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.Proposers)),
		Executors:                common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.Executors)),
		Cancellers:               common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.Cancellers)),
		Bypassers:                common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.Bypassers)),
		ExecutorRoleCheckEnabled: true,
		OpFinalizationTimeout:    0,
	}

	b.Logger.Infow("Initializing Timelock", "init", init, "timelockAddress", timelockAddress.String())

	payload, err := tlb.ToCell(init)
	if err != nil {
		return nil, err
	}

	messages := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &timelockAddress,
			Body:    payload,
		},
	}

	return utils.Serialize(messages)
}
