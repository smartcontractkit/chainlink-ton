package contracts

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRepoRoot(t *testing.T) {
	// The repository root holds the contracts directory and the root module.
	require.DirExists(t, filepath.Join(repoRoot, "contracts", "testdata"))
	_, err := os.Stat(filepath.Join(repoRoot, "go.mod"))
	require.NoError(t, err)
	require.FileExists(t, filepath.Join(repoRoot, "integration-tests", "testutils", "contracts", "paths.go"))
}

func TestPaths(t *testing.T) {
	require.Equal(t, filepath.Join(repoRoot, "contracts", "build", "examples.Counter.compiled.json"), BuildPath("examples.Counter.compiled.json"))
	require.Equal(t, filepath.Join(repoRoot, "contracts", "testdata", "legacy-tact", "x.pkg"), TestDataPath("legacy-tact/x.pkg"))
}
