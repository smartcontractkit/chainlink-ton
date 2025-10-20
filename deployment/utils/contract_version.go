package utils

import (
	_ "embed"
	"fmt"
	"strings"
)

//go:embed contract_build_sha
var contractBuildSHA string

func init() {
	sha := strings.TrimSpace(contractBuildSHA)
	if sha == "" {
		panic("contract build SHA not found: embedded contract_build_sha is empty")
	}
}

// GetContractBuildSHA returns the most up-to-date build SHA for contracts for the current version, to be used by other workflows/repos
//
//	note: the hash of the built artifacts is automatically modified only after a branch gets merged in the main branch as a release
func GetContractBuildSHA() string {
	return strings.TrimSpace(contractBuildSHA)
}
