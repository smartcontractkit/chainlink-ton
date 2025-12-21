//go:build tools
// +build tools

package tools

// This file imports packages that are used for tooling purposes (like mockery)
// to ensure their dependencies are tracked in go.mod
import (
	_ "github.com/smartcontractkit/chainlink-deployments-framework/offchain"
)