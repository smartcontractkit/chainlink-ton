// Package types provides backward compatibility for the old import path.
// Deprecated: Use github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models instead.
package types //nolint:revive // TODO: remove once core ref is updated

import "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"

type (
	ReplayStatus = models.ReplayStatus
	TxHash       = models.TxHash
	Tx           = models.Tx
	BlockRange   = models.BlockRange
	Filter       = models.Filter
	Log          = models.Log
	FilterIndex  = models.FilterIndex
	FilterKey    = models.FilterKey
	RawLog       = models.RawLog
)

type TypedLog[T any] = models.TypedLog[T]

const (
	ReplayStatusNoRequest = models.ReplayStatusNoRequest
	ReplayStatusRequested = models.ReplayStatusRequested
	ReplayStatusPending   = models.ReplayStatusPending
	ReplayStatusComplete  = models.ReplayStatusComplete
)

var FormatEventSig = models.FormatEventSig
