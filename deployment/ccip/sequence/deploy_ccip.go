package sequence

import (
	"fmt"
	"math/big"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/receiver"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
)

type DeployCCIPSeqInput struct {
	ContractsVersionSha string
	ContractsSemver     *semver.Version
	CCIPConfig          config.ChainContractParams
	ChainSelector       uint64
}

type TONContractAddress struct {
	TONAddress     address.Address
	CLDFAddressRef ds.AddressRef
}

type DeployCCIPSeqOutput struct {
	RouterAddress    *TONContractAddress
	FeeQuoterAddress *TONContractAddress
	OnRampAddress    *TONContractAddress
	OffRampAddress   *TONContractAddress
	ReceiverAddress  *TONContractAddress
	TimelockAddress  *TONContractAddress
	Transactions     [][]byte
}

var DeployCCIPSequence = operations.NewSequence(
	"ton-deploy-ccip-seq",
	semver.MustParse("0.1.0"),
	"Deploys contracts and sets initial CCIP configuration",
	deployCCIPSequence,
)

func deployCCIPSequence(b operations.Bundle, deps operation.TonDeps, in DeployCCIPSeqInput) (DeployCCIPSeqOutput, error) {
	// TODO: don't directly execute deployments, instead return them as txs

	// Initialize the output
	output := DeployCCIPSeqOutput{}

	retrieveContractsInput := RetrieveCompiledContractsSeqInput{
		ContractsSemver:     in.ContractsSemver,
		ContractsVersionSha: in.ContractsVersionSha,
		Contracts: []ds.ContractType{
			state.Router,
			state.FeeQuoter,
			state.OffRamp,
			state.OnRamp,
			state.TonReceiver,
			state.Timelock,
			state.SendExecutor,
			state.Deployer,
			state.MerkleRoot,
			state.ReceiveExecutor,
		},
	}

	tonCompiledContractsSeqOutput, err := operations.ExecuteSequence(b, RetrieveContractsSequence, deps, retrieveContractsInput)
	if err != nil {
		return output, err
	}

	tonCompiledContracts := tonCompiledContractsSeqOutput.Output.CompiledContracts

	// Router
	routerAddress := deps.CCIPOnChainState[in.ChainSelector].Router
	routerStorage := router.Storage{
		ID: in.CCIPConfig.RouterParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		OnRamps: nil, // set afterward
	}

	err = InvokeDeployContractOperation(b, deps, in.ChainSelector, routerAddress, tonCompiledContracts[state.Router], routerStorage, nil, func(tonContractAddress *TONContractAddress) {
		routerAddress = tonContractAddress.TONAddress
		output.RouterAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	// FeeQuoter
	feeQuoterAddress := deps.CCIPOnChainState[in.ChainSelector].FeeQuoter
	feeQuoterStorage := feequoter.Storage{
		ID: in.CCIPConfig.FeeQuoterParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		MaxFeeJuelsPerMsg:            in.CCIPConfig.FeeQuoterParams.MaxFeeJuelsPerMsg,
		LinkToken:                    address.NewAddressNone(), // TODO use real LINK address
		TokenPriceStalenessThreshold: in.CCIPConfig.FeeQuoterParams.TokenPriceStalenessThreshold,
		UsdPerToken:                  nil,
		PremiumMultiplierWeiPerEth:   nil,
		DestChainConfigs:             nil,
	}

	err = InvokeDeployContractOperation(b, deps, in.ChainSelector, feeQuoterAddress, tonCompiledContracts[state.FeeQuoter], feeQuoterStorage, nil, func(tonContractAddress *TONContractAddress) {
		feeQuoterAddress = tonContractAddress.TONAddress
		output.FeeQuoterAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	// OnRamp
	onRampAddress := deps.CCIPOnChainState[in.ChainSelector].OnRamp
	onRampStorage := onramp.Storage{
		ID: in.CCIPConfig.OnRampParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		ChainSelector: in.ChainSelector,
		Config: onramp.DynamicConfig{
			FeeQuoter:      &feeQuoterAddress,
			FeeAggregator:  in.CCIPConfig.OnRampParams.FeeAggregator,
			AllowListAdmin: deps.TonChain.WalletAddress,
		},
		DestChainConfigs: nil,
		ExecutorCode:     tonCompiledContracts[state.SendExecutor].Code,
		CurrentMessageID: big.NewInt(0),
	}

	err = InvokeDeployContractOperation(b, deps, in.ChainSelector, onRampAddress, tonCompiledContracts[state.OnRamp], onRampStorage, nil, func(tonContractAddress *TONContractAddress) {
		onRampAddress = tonContractAddress.TONAddress
		output.OnRampAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	// OffRamp
	offRampAddress := deps.CCIPOnChainState[in.ChainSelector].OffRamp
	offRampStorage := offramp.Storage{
		ID: in.CCIPConfig.OffRampParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		Deployables: offramp.Deployables{
			Deployer:            tonCompiledContracts[state.Deployer].Code,
			MerkleRootCode:      tonCompiledContracts[state.MerkleRoot].Code,
			ReceiveExecutorCode: tonCompiledContracts[state.ReceiveExecutor].Code,
		},
		// empty OCR3Base
		OCR3Base: cell.BeginCell().
			MustStoreUInt(0, 8).
			MustStoreBoolBit(false).
			MustStoreBoolBit(false).
			EndCell(),
		FeeQuoter:                               &feeQuoterAddress,
		ChainSelector:                           in.ChainSelector,
		PermissionlessExecutionThresholdSeconds: in.CCIPConfig.OffRampParams.PermissionlessExecutionThreshold,
		SourceChainConfigs:                      nil,
		LatestPriceSequenceNumber:               0,
	}

	err = InvokeDeployContractOperation(b, deps, in.ChainSelector, offRampAddress, tonCompiledContracts[state.OffRamp], offRampStorage, nil, func(tonContractAddress *TONContractAddress) {
		offRampAddress = tonContractAddress.TONAddress
		output.OffRampAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	// Receiver
	receiverAddress := deps.CCIPOnChainState[in.ChainSelector].ReceiverAddress
	receiverStorage := receiver.Storage{
		ID: in.CCIPConfig.ReceiverParams.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		AuthorizedCaller: &offRampAddress,
		Behavior:         receiver.Accept,
	}

	err = InvokeDeployContractOperation(b, deps, in.ChainSelector, receiverAddress, tonCompiledContracts[state.TonReceiver], receiverStorage, nil, func(tonContractAddress *TONContractAddress) {
		receiverAddress = tonContractAddress.TONAddress
		output.ReceiverAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	// Timelock
	timelockAddress := deps.CCIPOnChainState[in.ChainSelector].Timelock
	timelockStorage := timelock.Data{
		ID:                       in.CCIPConfig.TimelockParams.ID,
		MinDelay:                 in.CCIPConfig.TimelockParams.MinDelay,
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
	timelockMessageBody := timelock.Init{
		QueryID:                  0,
		MinDelay:                 in.CCIPConfig.TimelockParams.MinDelay,
		Admin:                    in.CCIPConfig.TimelockParams.Admin,
		Proposers:                common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.CCIPConfig.TimelockParams.Proposers)),
		Executors:                common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.CCIPConfig.TimelockParams.Executors)),
		Cancellers:               common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.CCIPConfig.TimelockParams.Cancellers)),
		Bypassers:                common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.CCIPConfig.TimelockParams.Bypassers)),
		ExecutorRoleCheckEnabled: true,
		OpFinalizationTimeout:    0,
	}

	err = InvokeDeployContractOperation(b, deps, in.ChainSelector, timelockAddress, tonCompiledContracts[state.Timelock], timelockStorage, timelockMessageBody, func(tonContractAddress *TONContractAddress) {
		timelockAddress = tonContractAddress.TONAddress
		output.TimelockAddress = tonContractAddress
	})
	if err != nil {
		return output, err
	}

	return output, nil
}

// InvokeDeployContractOperation deploys a TON contract if it's not already deployed.
// It checks the current address, executes the deployment operation if needed,
// and invokes the provided callback with the new contract address.
// Returns an error if the deployment fails.
func InvokeDeployContractOperation(b operations.Bundle, deps operation.TonDeps, chainSelector uint64, currentAddress address.Address, compiledContract CompiledContractData, storage any, messageBody any, callback func(*TONContractAddress)) error {
	if !currentAddress.IsAddrNone() {
		b.Logger.Infof("%s contract is already deployed at address: %s. Skipping...", compiledContract.Type, currentAddress.String())
	} else {
		deployContractInput := operation.DeployContractInput{
			Name:         compiledContract.Type.String(),
			Storage:      storage,
			MessageBody:  messageBody,
			ContractCode: compiledContract.Code,
			Coins:        compiledContract.SuggestedTONCoinsForDeployment,
		}

		deployContractReport, err := operations.ExecuteOperation(b, operation.DeployTONContractOp, deps, deployContractInput)
		if err != nil {
			return err
		}

		contractAddress := *deployContractReport.Output.Address
		tonContractAddress := &TONContractAddress{
			TONAddress: contractAddress,
			CLDFAddressRef: ds.AddressRef{
				Address:       contractAddress.String(),
				ChainSelector: chainSelector,
				Type:          compiledContract.Type,
				Version:       compiledContract.ContractSemver,
				Labels:        ds.NewLabelSet(fmt.Sprintf("sha:%v", compiledContract.ContractVersionSha)),
			},
		}

		callback(tonContractAddress)
	}

	return nil
}
