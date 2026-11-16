package tracetracking_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking/tracetest"
)

// sendToContract records wallet -> contract, which sends a message to other, and returns the trace
// root and that message.
func sendToContract(t *testing.T, chain *tracetest.Chain) (*tracetracking.ReceivedMessage, *tracetest.Tx) {
	t.Helper()
	in := chain.Send(wallet, contract, tracetest.Body(1))
	rootTx := chain.Receive(in, tracetest.Out{Dst: other, Body: tracetest.Body(2)})
	return mapRoot(t, rootTx), &rootTx
}

func TestWaitForTrace_FindsReceiptAmongOtherTransactions(t *testing.T) {
	chain := tracetest.NewChain(t)
	root, rootTx := sendToContract(t, chain)
	toOther := rootTx.Out[0]

	// other receives more messages in the same block than a listing page holds, both before and
	// after the traced one, and accounts on both sides of it transact in the block too.
	chain.OpenBlock()
	chain.Receive(chain.Send(wallet, pingA, tracetest.Body(3)))
	for range 20 {
		chain.Receive(chain.Send(wallet, other, tracetest.Body(3)))
	}
	chain.Receive(toOther)
	chain.Receive(chain.Send(wallet, other, tracetest.Body(3)))
	chain.Receive(chain.Send(wallet, tracetest.Addr(9), tracetest.Body(3)))
	chain.CloseBlock()

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	require.NoError(t, root.WaitForTrace(ctx, chain))

	require.Len(t, root.OutgoingInternalReceivedMessages, 1)
	require.Equal(t, toOther.CreatedLT, root.OutgoingInternalReceivedMessages[0].InternalMsg.CreatedLT)
}

func TestWaitForTrace_FindsReceiptBlocksLater(t *testing.T) {
	chain := tracetest.NewChain(t)
	root, rootTx := sendToContract(t, chain)

	for range 5 {
		chain.Receive(chain.Send(wallet, pingA, tracetest.Body(3)))
	}
	chain.Receive(rootTx.Out[0])

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	require.NoError(t, root.WaitForTrace(ctx, chain))
	require.Len(t, root.OutgoingInternalReceivedMessages, 1)
}

func TestWaitForTrace_WaitsForReceipt(t *testing.T) {
	chain := tracetest.NewChain(t)
	root, rootTx := sendToContract(t, chain)

	go func() {
		time.Sleep(100 * time.Millisecond)
		chain.Receive(rootTx.Out[0])
	}()

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	require.NoError(t, root.WaitForTrace(ctx, chain))
	require.Len(t, root.OutgoingInternalReceivedMessages, 1)
}
