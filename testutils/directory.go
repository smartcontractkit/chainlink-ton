package testutils

import (
	"fmt"
	"os/exec"
	"path"
	"strings"
)

func GetRepoRootDir() string {
	// use git rev-parse --show-toplevel
	// to get the root directory of the git repository

	res := exec.Command("git", "rev-parse", "--show-toplevel")
	stdout, err := res.Output()
	if err != nil {
		panic(fmt.Sprintf("Failed to get repo root dir: %v", err))
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
