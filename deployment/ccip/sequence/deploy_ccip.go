package sequence

import (
	"fmt"
	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/utils"
	"github.com/xssnick/tonutils-go/address"
	"os"
)

const (
	contractsGithubOrganization  = "smartcontractkit"
	contractsGithubRepository    = "chainlink-ton"
	contractsGithubReleasePrefix = "ton-contracts-build-"
	contractsGithubAssetPrefix   = "ton-contracts-build-"
	contractsFileNameSuffix      = ".compiled.json"
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
		ChainSelector: in.CCIPConfig.OnRampParams.ChainSelector,
		FeeQuoter:     deployFeeQuoterReport.Output.Address,
		FeeAggregator: in.CCIPConfig.OnRampParams.FeeAggregator,
		ContractPath:  utils.GetBuildDir("OnRamp.compiled.json"),
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

//package operation
//
//import (
//"archive/tar"
//"bytes"
//"compress/gzip"
//"context"
//"fmt"
//"io"
//"net/http"
//"path"
//"strings"
//"time"
//
//"github.com/Masterminds/semver/v3"
//"github.com/smartcontractkit/chainlink-deployments-framework/operations"
//)
//
//const (
//	owner           = "smartcontractkit"
//	repo            = "chainlink-ton"
//	contractsSuffix = ".compiled.json"
//)
//
//type Artifact struct {
//	Path string
//	Data []byte
//}
//
//type DownloadArtifactsInput struct {
//	ContractsVersion    string
//	Organization        string
//	Repository          string
//	Release             string
//	Asset               string
//	FilesSuffixToFilter string
//}
//
//type DownloadArtifactsOutput struct {
//	Files []Artifact
//}
//
//var DownloadArtifactsOp = operations.NewOperation(
//	"download-artifacts-op",
//	semver.MustParse("0.1.0"),
//	"Downloads a release tar.gz artifact from Github and extracts and retrieves the files that match with the given filter",
//	downloadContracts,
//)
//
//func downloadContracts(b operations.Bundle, deps TonDeps, in DownloadArtifactsInput) (DownloadArtifactsOutput, error) {
//	output := DownloadArtifactsOutput{}
//
//	release := "ton-contracts-build-" + in.ContractsVersion
//	asset := release + ".tar.gz"
//
//	url := fmt.Sprintf(
//		"https://github.com/%s/%s/releases/download/%s/%s",
//		owner, repo, release, asset,
//	)
//
//	rawTarGz, err := getBytesFromURL(b.GetContext(), url)
//
//	if err != nil {
//		return output, fmt.Errorf("failed to download contracts from %s: %w", url, err)
//	}
//
//	contractsOutput, err := extractFiles(rawTarGz)
//
//	if err != nil {
//		return output, fmt.Errorf("failed to extract contracts from .tar.gz %s: %w", url, err)
//	}
//
//	output.Files = contractsOutput
//
//	return output, nil
//}
//
//func extractFiles(rawTarGz []byte) ([]Artifact, error) {
//	gzipReader, err := gzip.NewReader(bytes.NewReader(rawTarGz))
//	if err != nil {
//		return nil, err
//	}
//	defer gzipReader.Close()
//
//	tarReader := tar.NewReader(gzipReader)
//
//	var out []Artifact
//	for {
//		header, err := tarReader.Next()
//		if err == io.EOF {
//			break
//		}
//		if err != nil {
//			return nil, err
//		}
//
//		switch header.Typeflag {
//		case tar.TypeReg:
//			clean := path.Clean(strings.TrimPrefix(header.Name, "./"))
//			if clean == "" || strings.HasPrefix(clean, "/") || strings.Contains(clean, "..") {
//				continue
//			}
//
//			// Only accept root-level files (no "/")
//			if strings.Contains(clean, "/") {
//				continue
//			}
//
//			// Only accept ".compile" suffix
//			if !strings.HasSuffix(clean, contractsSuffix) {
//				continue
//			}
//
//			var buf bytes.Buffer
//			if _, err := io.Copy(&buf, tarReader); err != nil {
//				return nil, fmt.Errorf("read %q: %w", clean, err)
//			}
//
//			out = append(out, Artifact{
//				Path: clean,
//				Data: buf.Bytes(),
//			})
//		default:
//			// skip dirs, symlinks, etc.
//		}
//
//	}
//
//	return out, nil
//}
//
//func getBytesFromURL(ctx context.Context, url string) ([]byte, error) {
//	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
//
//	if err != nil {
//		return nil, err
//	}
//
//	cl := &http.Client{Timeout: 90 * time.Second}
//	resp, err := cl.Do(req)
//
//	if err != nil {
//		return nil, err
//	}
//
//	defer resp.Body.Close()
//
//	if resp.StatusCode != http.StatusOK {
//		b, _ := io.ReadAll(resp.Body)
//		return nil, fmt.Errorf("GET %s responded with an error: %s: %s", url, resp.Status, string(b))
//	}
//
//	return io.ReadAll(resp.Body)
//}
