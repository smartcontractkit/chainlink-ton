package helpers

import (
	"context"
	"fmt"
	"os/exec"
	"path"
	"strings"
)

func GetRepoRootDir(ctx context.Context) string {
	res := exec.CommandContext(ctx, "git", "rev-parse", "--show-toplevel")
	stdout, err := res.Output()
	if err != nil {
		panic(fmt.Sprintf("failed to get repo root dir: %s", err))
	}
	rootDir := strings.TrimSpace(string(stdout))
	return rootDir
}

func GetBuildsDir(ctx context.Context) string {
	repoRoot := GetRepoRootDir(ctx)
	return path.Join(repoRoot, "contracts", "build")
}

func GetBuildDir(ctx context.Context, contractPath string) string {
	buildsDir := GetBuildsDir(ctx)
	return path.Join(buildsDir, contractPath)
}
