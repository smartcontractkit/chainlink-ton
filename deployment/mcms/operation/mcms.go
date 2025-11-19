package operation

import (
	"fmt"
	"math/big"
	"strconv"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	operation2 "github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployMCMSInput struct {
	ID            uint32
	ChainSelector uint64
	ContractPath  string
	Coins         string
	ChainID       string
}

type DeployMCMSOutput struct {
	Address address.Address
}

var DeployMCMSOp = operations.NewOperation(
	"deploy-mcms-op",
	semver.MustParse("0.1.0"),
	"Deploys and initialize the MCMS contract",
	deployMCMS,
)

func deployMCMS(b operations.Bundle, deps operation2.TonDeps, in DeployMCMSInput) (DeployMCMSOutput, error) {
	if currentAddr := deps.CCIPOnChainState[in.ChainSelector].MCMS; !currentAddr.IsAddrNone() {
		b.Logger.Infof("MCMS contract is already deployed at address: %s. Skipping...", currentAddr.String())
		return DeployMCMSOutput{}, nil
	}

	output := DeployMCMSOutput{}

	codeCell, err := wrappers.ParseCompiledContract(in.ContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	chainIDInt, err := strconv.ParseInt(in.ChainID, 10, 64)
	if err != nil {
		return output, fmt.Errorf("invalid ChainID: %w", err)
	}
	chainID := big.NewInt(chainIDInt)

	initStorage := mcms.Data{
		ID: in.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		Oracle:  tvm.ZeroAddress,
		Signers: must(tvm.MakeDict(map[*big.Int]mcms.Signer{}, tvm.KeyUINT256)),
		Config: mcms.Config{
			Signers:      must(tvm.MakeDictFrom([]mcms.Signer{}, tvm.KeyUINT8)),
			GroupQuorums: must(tvm.MakeDictFrom([]mcms.GroupQuorum{}, tvm.KeyUINT8)),
			GroupParents: must(tvm.MakeDictFrom([]mcms.GroupParent{}, tvm.KeyUINT8)),
		},
		SeenSignedHashes: must(tvm.MakeDict(map[*big.Int]mcms.SeenSignedHash{}, tvm.KeyUINT256)),
		RootInfo: mcms.RootInfo{
			ExpiringRootAndOpCount: mcms.ExpiringRootAndOpCount{
				Root:       big.NewInt(0),
				ValidUntil: 0,
				OpCount:    0,
				OpPendingInfo: mcms.OpPendingInfo{
					ValidAfter:             0,
					OpFinalizationTimeout:  0,
					OpPendingReceiver:      tvm.ZeroAddress,
					OpPendingBodyTruncated: big.NewInt(0),
				},
			},
			RootMetadata: mcms.RootMetadata{
				ChainID:              chainID,
				MultiSig:             tvm.ZeroAddress,
				PreOpCount:           0,
				PostOpCount:          0,
				OverridePreviousRoot: false,
			},
		},
	}
	initData, err := tlb.ToCell(initStorage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	bodyCell := cell.BeginCell().EndCell()
	contract, _, err := wrappers.Deploy(
		&conn,
		codeCell,
		initData,
		tlb.MustFromTON(in.Coins),
		bodyCell,
	)
	if err != nil {
		return output, fmt.Errorf("failed to deploy mcms contract: %w", err)
	}
	b.Logger.Infow("Deployed MCMS", "addr", contract.Address, "deployer wallet addr", deps.TonChain.WalletAddress.String())

	output.Address = *contract.Address
	return output, nil
}

func must[E any](out E, err error) E {
	if err != nil {
		panic(err)
	}
	return out
}
