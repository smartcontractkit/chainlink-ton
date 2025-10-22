package sequence

import (
	"fmt"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"os"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/utils"
)

const (
	contractsGithubOrganization  = "smartcontractkit"
	contractsGithubRepository    = "chainlink-ton"
	contractsGithubReleasePrefix = "ton-contracts-build-"
	contractsGithubAssetPrefix   = "ton-contracts-build-"
	contractsFileNameSuffix      = ".compiled.json"
	ContractsLocalVersion        = "local"
	StandardContractCostInTON    = "0.05"
)

type DeployCCIPSeqInput struct {
	ContractsVersion string // TODO We may want to rename this to ContractsVersionSHA or ContractsVersionRelease instead
	CCIPConfig       config.ChainContractParams
	ChainSelector    uint64
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

	// In order to run this locally we can use 'develop' version as assuming that that contracts will be there
	if in.ContractsVersion != ContractsLocalVersion {
		// Download contracts
		downloadArtifactsInput := operation.DownloadArtifactsInput{
			Organization:        contractsGithubOrganization,
			Repository:          contractsGithubRepository,
			Release:             contractsGithubReleasePrefix + in.ContractsVersion,
			Asset:               contractsGithubAssetPrefix + in.ContractsVersion,
			FilesSuffixToFilter: contractsFileNameSuffix,
		}
		downloadArtifactsOutput, err := operations.ExecuteOperation(b, operation.DownloadArtifactsOp, deps, downloadArtifactsInput)

		if err != nil {
			return output, err
		}

		if err := os.MkdirAll(utils.GetBuildDir(""), 0o755); err != nil {
			return output, fmt.Errorf("failed to create dirs to store contracts: %w", err)
		}

		for _, a := range downloadArtifactsOutput.Output.Artifacts {
			// Save the files in the corresponding location so that the deployment operations can find them
			path := utils.GetBuildDir(a.Path)

			if err := os.WriteFile(path, a.Data, 0o644); err != nil {
				return output, fmt.Errorf("failed to contract to path %s: %w", path, err)
			}

			b.Logger.Infof("Saved contract artifact %s", path)
		}
	} else {
		b.Logger.Infof("Not downloading contracts from Github. Using local version")
	}

	contractsSemver := semver.MustParse("1.6.0") // TODO Revisit versioning. How to handle semver & sha approaches?

	// Router
	routerAddress := deps.CCIPOnChainState[in.ChainSelector].Router
	if !routerAddress.IsAddrNone() {
		b.Logger.Infof("Router contract is already deployed at address: %s. Skipping...", routerAddress.String())
	} else {
		routerInput := operation.DeployRouterInput{
			ID:           in.CCIPConfig.RouterParams.ID,
			ContractPath: utils.GetBuildDir("Router.compiled.json"),
			Coins:        StandardContractCostInTON,
		}
		deployRouterReport, err := operations.ExecuteOperation(b, operation.DeployRouterOp, deps, routerInput)
		if err != nil {
			return output, err
		}

		routerAddress = *deployRouterReport.Output.Address
		output.RouterAddress = &TONContractAddress{
			TONAddress: routerAddress,
			CLDFAddressRef: ds.AddressRef{
				Address:       routerAddress.String(),
				ChainSelector: in.ChainSelector,
				Type:          state.Router,
				Version:       contractsSemver,
				Labels:        ds.NewLabelSet(fmt.Sprintf("sha:%v", in.ContractsVersion)),
			},
		}
	}

	// FeeQuoter
	feeQuoterAddress := deps.CCIPOnChainState[in.ChainSelector].FeeQuoter
	if !feeQuoterAddress.IsAddrNone() {
		b.Logger.Infof("Fee Quoter contract is already deployed at address: %s. Skipping...", feeQuoterAddress.String())
	} else {
		feeQuoterInput := operation.DeployFeeQuoterInput{
			Params:       in.CCIPConfig.FeeQuoterParams,
			LinkAddr:     address.NewAddressNone(), // TODO use real LINK address
			ContractPath: utils.GetBuildDir("FeeQuoter.compiled.json"),
			Coins:        StandardContractCostInTON,
		}
		deployFeeQuoterReport, err := operations.ExecuteOperation(b, operation.DeployFeeQuoterOp, deps, feeQuoterInput)
		if err != nil {
			return output, err
		}

		feeQuoterAddress = *deployFeeQuoterReport.Output.Address
		output.FeeQuoterAddress = &TONContractAddress{
			TONAddress: feeQuoterAddress,
			CLDFAddressRef: ds.AddressRef{
				Address:       feeQuoterAddress.String(),
				ChainSelector: in.ChainSelector,
				Type:          state.FeeQuoter,
				Version:       contractsSemver,
				Labels:        ds.NewLabelSet(fmt.Sprintf("sha:%v", in.ContractsVersion)),
			},
		}
	}

	// OnRamp
	onRampAddress := deps.CCIPOnChainState[in.ChainSelector].OnRamp
	if !onRampAddress.IsAddrNone() {
		b.Logger.Infof("Onramp contract is already deployed at address: %s. Skipping...", onRampAddress.String())
	} else {
		onrampInput := operation.DeployOnRampInput{
			ID:                   in.CCIPConfig.OnRampParams.ID,
			ChainSelector:        in.CCIPConfig.OnRampParams.ChainSelector,
			FeeQuoter:            &feeQuoterAddress,
			FeeAggregator:        in.CCIPConfig.OnRampParams.FeeAggregator,
			ContractPath:         utils.GetBuildDir("OnRamp.compiled.json"),
			ExecutorContractPath: utils.GetBuildDir("CCIPSendExecutor.compiled.json"),
			Coins:                StandardContractCostInTON,
		}

		deployOnRampReport, err := operations.ExecuteOperation(b, operation.DeployOnRampOp, deps, onrampInput)
		if err != nil {
			return output, err
		}

		onRampAddress = *deployOnRampReport.Output.Address
		output.OnRampAddress = &TONContractAddress{
			TONAddress: onRampAddress,
			CLDFAddressRef: ds.AddressRef{
				Address:       onRampAddress.String(),
				ChainSelector: in.ChainSelector,
				Type:          state.OnRamp,
				Version:       contractsSemver,
				Labels:        ds.NewLabelSet(fmt.Sprintf("sha:%v", in.ContractsVersion)),
			},
		}
	}

	// OffRamp
	offRampAddress := deps.CCIPOnChainState[in.ChainSelector].OffRamp
	if !offRampAddress.IsAddrNone() {
		b.Logger.Infof("Offramp contract is already deployed at address: %s. Skipping...", offRampAddress.String())
	} else {
		offrampInput := operation.DeployOffRampInput{
			ID:                                      in.CCIPConfig.OffRampParams.ID,
			ChainSelector:                           in.CCIPConfig.OffRampParams.ChainSelector,
			FeeQuoter:                               &feeQuoterAddress,
			PermissionlessExecutionThresholdSeconds: in.CCIPConfig.OffRampParams.PermissionlessExecutionThreshold,
			ContractPath:                            utils.GetBuildDir("OffRamp.compiled.json"),
			DeployerContractPath:                    utils.GetBuildDir("Deployable.compiled.json"),
			MerkleRootContractPath:                  utils.GetBuildDir("MerkleRoot.compiled.json"),
			ReceiveExecutorContractPath:             utils.GetBuildDir("ReceiveExecutor.compiled.json"),
			Coins:                                   StandardContractCostInTON,
		}

		deployOffRampReport, err := operations.ExecuteOperation(b, operation.DeployOffRampOp, deps, offrampInput)
		if err != nil {
			return output, err
		}

		offRampAddress = *deployOffRampReport.Output.Address
		output.OffRampAddress = &TONContractAddress{
			TONAddress: offRampAddress,
			CLDFAddressRef: ds.AddressRef{
				Address:       offRampAddress.String(),
				ChainSelector: in.ChainSelector,
				Type:          state.OffRamp,
				Version:       contractsSemver,
				Labels:        ds.NewLabelSet(fmt.Sprintf("sha:%v", in.ContractsVersion)),
			},
		}
	}

	// Receiver
	receiverAddress := deps.CCIPOnChainState[in.ChainSelector].ReceiverAddress
	if !receiverAddress.IsAddrNone() {
		b.Logger.Infof("Receiver contract is already deployed at address: %s. Skipping...", receiverAddress.String())
	} else {
		receiverInput := operation.DeployReceiverInput{
			ID:             in.CCIPConfig.ReceiverParams.ID,
			OffRampAddress: &offRampAddress,
			Coins:          StandardContractCostInTON,
			ContractPath:   utils.GetBuildDir("ccip.test.receiver.compiled.json"),
		}

		deployReceiverReport, err := operations.ExecuteOperation(b, operation.DeployReceiverOp, deps, receiverInput)
		if err != nil {
			return output, err
		}

		receiverAddress = *deployReceiverReport.Output.Address
		output.ReceiverAddress = &TONContractAddress{
			TONAddress: receiverAddress,
			CLDFAddressRef: ds.AddressRef{
				Address:       receiverAddress.String(),
				ChainSelector: in.ChainSelector,
				Type:          state.TonReceiver,
				Version:       contractsSemver,
				Labels:        ds.NewLabelSet(fmt.Sprintf("sha:%v", in.ContractsVersion)),
			},
		}
	}

	// Timelock
	timelockAddress := deps.CCIPOnChainState[in.ChainSelector].Timelock
	if !timelockAddress.IsAddrNone() {
		b.Logger.Infof("Timelock contract is already deployed at address: %s. Skipping...", timelockAddress.String())
	} else {
		timelockInput := operation.DeployTimelockInput{
			ID:           in.CCIPConfig.TimelockParams.ID,
			ContractPath: utils.GetBuildDir("mcms.RBACTimelock.compiled.json"),
			Coins:        "1",
			MinDelay:     in.CCIPConfig.TimelockParams.MinDelay,
			Admin:        in.CCIPConfig.TimelockParams.Admin,
			Proposers:    in.CCIPConfig.TimelockParams.Proposers,
			Executors:    in.CCIPConfig.TimelockParams.Executors,
			Cancellers:   in.CCIPConfig.TimelockParams.Cancellers,
			Bypassers:    in.CCIPConfig.TimelockParams.Bypassers,
		}
		deployTimelockReport, err := operations.ExecuteOperation(b, operation.DeployTimelockOp, deps, timelockInput)
		if err != nil {
			return output, err
		}

		timelockAddress = *deployTimelockReport.Output.Address
		output.TimelockAddress = &TONContractAddress{
			TONAddress: timelockAddress,
			CLDFAddressRef: ds.AddressRef{
				Address:       timelockAddress.String(),
				ChainSelector: in.ChainSelector,
				Type:          state.Timelock,
				Version:       contractsSemver,
				Labels:        ds.NewLabelSet(fmt.Sprintf("sha:%v", in.ContractsVersion)),
			},
		}
	}

	return output, nil
}
