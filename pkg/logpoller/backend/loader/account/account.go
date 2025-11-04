// Package account provides backward compatibility for the old import path.
// Deprecated: Use github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader instead.
package account

import "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"

// Re-export New function from the new location
var New = loader.New

