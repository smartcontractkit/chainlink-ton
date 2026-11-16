package txm

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking/tracetest"
)

func TestCheckUnconfirmed_FinalizesOnlyCompleteTraces(t *testing.T) {
	var (
		wallet   = tracetest.Addr(1)
		contract = tracetest.Addr(2)
		other    = tracetest.Addr(3)
	)

	// wallet -> contract -> other -> contract, with the last message not received yet.
	chain := tracetest.NewChain(t)
	in := chain.Send(wallet, contract, tracetest.Body(1))
	rootTx := chain.Receive(in, tracetest.Out{Dst: other, Body: tracetest.Body(2)})
	otherTx := chain.Receive(rootTx.Out[0], tracetest.Out{Dst: contract, Body: tracetest.Body(3)})
	root, err := tracetracking.MapToReceivedMessage(rootTx.Transaction)
	require.NoError(t, err)

	cfg := DefaultConfigSet
	cfg.TraceTimeout = config.MustNewDuration(200 * time.Millisecond)
	cfg.EnableTraceLogging = new(false)
	clientProvider := func(context.Context) (tracetracking.SignedAPIClient, error) {
		return tracetracking.SignedAPIClient{Client: chain}, nil
	}
	txm, err := New(logger.Test(t), "test", nil, clientProvider, cfg)
	require.NoError(t, err)

	store := txm.accountStore.GetTxStore(wallet.String())
	expiration := time.Now().Add(time.Hour)
	require.NoError(t, store.AddUnconfirmed(root.LamportTime, uint64(expiration.UnixMilli()), &Tx{
		Expiration:      expiration,
		ReceivedMessage: root,
	}))

	requireStatus := func(want tracetracking.MsgStatus) {
		t.Helper()
		status, _, _, _, found := store.GetTxState(root.LamportTime)
		require.True(t, found)
		require.Equal(t, want, status)
	}

	// The first pass times out waiting for the last message, and the next one finds the trace still
	// incomplete: the transaction stays unconfirmed through both.
	txm.checkUnconfirmed(t.Context())
	requireStatus(tracetracking.Cascading)
	txm.checkUnconfirmed(t.Context())
	requireStatus(tracetracking.Cascading)

	// Once the last message is received, the trace completes and the transaction is finalized.
	chain.Receive(otherTx.Out[0])
	txm.checkUnconfirmed(t.Context())
	requireStatus(tracetracking.Finalized)
	_, succeeded, _, _, _ := store.GetTxState(root.LamportTime)
	require.True(t, succeeded)
}
