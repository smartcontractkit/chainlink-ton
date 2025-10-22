package lib

import (
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	tt "github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

type DebuggerVisualization interface {
	NewActor(address string, contractType cldf.ContractType, name string)
	NewSentMessage(msg *tt.SentMessage, info MessageInfo) DebuggerVisualization
	NewReceivedMessage(msg *tt.ReceivedMessage, info TxInfo) DebuggerVisualization
	NewEvent(msg *tt.OutgoingExternalMessages, info MessageInfo)
	ToString() string
}
