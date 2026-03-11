package operation

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

var DownloadArtifactsOp = operations.NewOperation(
	"ton/ops/download-artifacts",
	semver.MustParse("0.1.0"),
	"Downloads a release tar.gz artifact from Github and extracts and retrieves the files that match with the given filter",
	downloadArtifactsOperationHandler,
)

func downloadArtifactsOperationHandler(b operations.Bundle, _ *dep.DependencyProvider, in utils.DownloadArtifactsInput) (utils.DownloadArtifactsOutput, error) {
	output, err := utils.DownloadArtifacts(b.GetContext(), in)
	if err != nil {
		return output, fmt.Errorf("failed to download and extract artifacts: %w", err)
	}
	return output, nil
}
