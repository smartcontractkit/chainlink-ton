package lib

import (
	tt "github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

type DebuggerVisualization interface {
	NewActor(address string, contractType string, name string)
	NewSentMessage(msg *tt.SentMessage, info MessageInfo) DebuggerVisualization
	NewReceivedMessage(msg *tt.ReceivedMessage, info TxInfo) DebuggerVisualization
	NewEvent(msg *tt.OutgoingExternalMessages, info MessageInfo)
	ToString() string
}
