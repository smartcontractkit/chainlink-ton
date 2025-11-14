// Package account provides backward compatibility for the old import path.
// Deprecated: Use github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader instead.
// TODO: remove once core ref is updated
package account

import "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"

var New = loader.New
