// Package types provides backward compatibility for the old import path.
// Deprecated: Use github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models instead.
package types

import "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"

// Re-export all types from the new location
type (
	ReplayStatus = models.ReplayStatus
	TxHash       = models.TxHash
	Tx           = models.Tx
	BlockRange   = models.BlockRange
	Filter       = models.Filter
	Log          = models.Log
	TypedLog     = models.TypedLog
	FilterIndex  = models.FilterIndex
	FilterKey    = models.FilterKey
	RawLog       = models.RawLog
)

// Re-export constants
const (
	ReplayStatusNoRequest  = models.ReplayStatusNoRequest
	ReplayStatusRequested  = models.ReplayStatusRequested
	ReplayStatusPending    = models.ReplayStatusPending
	ReplayStatusComplete   = models.ReplayStatusComplete
)

// Re-export functions
var FormatEventSig = models.FormatEventSig

