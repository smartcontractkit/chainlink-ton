package sequence

import (
	"fmt"
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
)

type DeployCCIPSeqInput struct {
	ContractsVersion string
	CCIPConfig       config.ChainContractParams
}

type DeployCCIPSeqOutput struct {
	RouterAddress    *address.Address
	FeeQuoterAddress *address.Address
	OnRampAddress    *address.Address
	OffRampAddress   *address.Address
	Transactions     [][]byte
}

var DeployCCIPSequence = operations.NewSequence(
	"ton-deploy-ccip-seq",
	semver.MustParse("0.1.0"),
	"Deploys contracts and sets initial CCIP configuration",
	deployCCIPSequence,
)

// TODO: make idempotent by only deploying if address not yet set?
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

	routerInput := operation.DeployRouterInput{
		// chainSelector ?
		ContractPath: utils.GetBuildDir("Router.compiled.json"),
	}
	deployRouterReport, err := operations.ExecuteOperation(b, operation.DeployRouterOp, deps, routerInput)
	if err != nil {
		return output, err
	}
	output.RouterAddress = deployRouterReport.Output.Address

	feeQuoterInput := operation.DeployFeeQuoterInput{
		Params:       in.CCIPConfig.FeeQuoterParams,
		LinkAddr:     address.NewAddressNone(),
		ContractPath: utils.GetBuildDir("FeeQuoter.compiled.json"),
	}
	deployFeeQuoterReport, err := operations.ExecuteOperation(b, operation.DeployFeeQuoterOp, deps, feeQuoterInput)
	if err != nil {
		return output, err
	}
	output.FeeQuoterAddress = deployFeeQuoterReport.Output.Address

	onrampInput := operation.DeployOnRampInput{
		ChainSelector:        in.CCIPConfig.OnRampParams.ChainSelector,
		FeeQuoter:            deployFeeQuoterReport.Output.Address,
		FeeAggregator:        in.CCIPConfig.OnRampParams.FeeAggregator,
		ContractPath:         utils.GetBuildDir("OnRamp.compiled.json"),
		ExecutorContractPath: utils.GetBuildDir("CCIPSendExecutor.compiled.json"),
	}

	deployOnRampReport, err := operations.ExecuteOperation(b, operation.DeployOnRampOp, deps, onrampInput)
	if err != nil {
		return output, err
	}
	output.OnRampAddress = deployOnRampReport.Output.Address

	offrampInput := operation.DeployOffRampInput{
		ChainSelector:                           in.CCIPConfig.OffRampParams.ChainSelector,
		FeeQuoter:                               deployFeeQuoterReport.Output.Address,
		PermissionlessExecutionThresholdSeconds: in.CCIPConfig.OffRampParams.PermissionlessExecutionThreshold,
		ContractPath:                            utils.GetBuildDir("OffRamp.compiled.json"),
	}
	// TODO: the rest of OffRampParams (SourceChain config)

	deployOffRampReport, err := operations.ExecuteOperation(b, operation.DeployOffRampOp, deps, offrampInput)
	if err != nil {
		return output, err
	}
	output.OffRampAddress = deployOffRampReport.Output.Address

	return output, nil
}
