// Package contracts locates compiled contract artifacts in the repository for
// tests.
package contracts

import (
	"path/filepath"
	"runtime"
)

// repoRoot is the repository root, resolved from this source file's location
// (integration-tests/testutils/contracts).
var repoRoot = func() string {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		panic("unable to determine the location of the contracts test helper")
	}
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "..")
}()

// BuildPath returns the path of a contract build artifact in contracts/build.
// The contracts must be built first.
func BuildPath(name string) string {
	return filepath.Join(repoRoot, "contracts", "build", name)
}

// TestDataPath returns the path of a versioned contract fixture in
// contracts/testdata. Unlike build artifacts, test data is available without
// building the contracts first.
func TestDataPath(name string) string {
	return filepath.Join(repoRoot, "contracts", "testdata", name)
}
