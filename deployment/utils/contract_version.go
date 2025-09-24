package utils

import (
	"os"
	"strings"
)

// GetContractBuildSHA returns the most up-to-date build SHA for contracts for the current version, to be used by other workflows/repos
//
//	note: the hash of the built artifacts is automatically modified only after a branch gets merged in the main branch as a release
func GetContractBuildSHA() (string, error) {
	const shaFile = ".contract_build_sha"
	data, err := os.ReadFile(shaFile)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}
