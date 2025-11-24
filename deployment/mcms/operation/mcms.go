package operation

import (
	"fmt"
	"math/big"
	"strconv"

	"github.com/Masterminds/semver/v3"
	chainsel "github.com/smartcontractkit/chain-selectors"
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
	ID           uint32
	ContractPath string
	Coins        string
}

var DeployMCMSOp = operations.NewOperation(
	"deploy-mcms-op",
	semver.MustParse("0.1.0"),
	"Deploys and initialize the MCMS contract",
	deployMCMS,
)

func deployMCMS(b operations.Bundle, deps operation2.TonDeps, in DeployMCMSInput) (*address.Address, error) {
	chainSelector := deps.TonChain.ChainSelector()
	if currentAddr := deps.MCMSChainState[chainSelector].MCMS; !currentAddr.IsAddrNone() {
		b.Logger.Infof("MCMS contract is already deployed at address: %s. Skipping...", currentAddr.String())
		return nil, nil
	}

	chainIDStr, err := chainsel.GetChainIDFromSelector(chainSelector)
	if err != nil {
		return nil, fmt.Errorf("failed to get chainID from selector %d: %w", chainSelector, err)
	}

	chainIDInt, err := strconv.ParseInt(chainIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid ChainID: %w", err)
	}

	chainID := big.NewInt(chainIDInt)

	codeCell, err := wrappers.ParseCompiledContract(in.ContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	initStorage := mcms.Data{
		ID: in.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		Oracle:  tvm.ZeroAddress,
		Signers: cell.NewDict(256),
		Config: mcms.Config{
			Signers:      cell.NewDict(8),
			GroupQuorums: cell.NewDict(8),
			GroupParents: cell.NewDict(8),
		},
		SeenSignedHashes: cell.NewDict(256),
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
		return nil, fmt.Errorf("failed to pack initData: %w", err)
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
		return nil, fmt.Errorf("failed to deploy mcms contract: %w", err)
	}
	b.Logger.Infow("Deployed MCMS", "addr", contract.Address, "deployer wallet addr", deps.TonChain.WalletAddress.String())

	return contract.Address, nil
}
