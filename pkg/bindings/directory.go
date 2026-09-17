package bindings

import (
	"context"
	"fmt"
	"os/exec"
	"path"
	"strings"
)

func GetRepoRootDir() string {
	// use git rev-parse --show-toplevel
	// to get the root directory of the git repository

	res := exec.CommandContext(context.TODO(), "git", "rev-parse", "--show-toplevel")
	stdout, err := res.Output()
	if err != nil {
		panic(fmt.Sprintf("failed to get repo root dir: %s", err))
	}
	rootDir := strings.TrimSpace(string(stdout))
	return rootDir
}

func GetBuildsDir() string {
	repoRoot := GetRepoRootDir()
	return path.Join(repoRoot, "contracts", "build")
}

func GetBuildDir(contractPath string) string {
	buildsDir := GetBuildsDir()
	return path.Join(buildsDir, contractPath)
}

// GetTestDataDir returns the location of versioned contract fixtures.
//
// Unlike build artifacts, test data is available without running the contract
// build first. Use this only for contracts that exist solely to support tests.
func GetTestDataDir(contractPath string) string {
	repoRoot := GetRepoRootDir()
	return path.Join(repoRoot, "contracts", "testdata", contractPath)
}
