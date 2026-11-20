package tracetracking

import (
	"context"
	"crypto/rand"
	"math/big"
	mathrand "math/rand/v2"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/contracts"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/ton/wrappers"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/tracetracking/testutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

// traceProbeStorage is the storage of contracts/test/mock/trace_probe.tolk.
type traceProbeStorage struct {
	QueryID uint64 `tlb:"## 64"`
}

// traceProbeSelfDestruct makes the probe destroy itself, sending its balance back to the sender.
type traceProbeSelfDestruct struct {
	_       tlb.Magic `tlb:"#34967105"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

// traceProbeForward makes the probe send Value to To, bounceable or not, paying the fees itself.
type traceProbeForward struct {
	_          tlb.Magic        `tlb:"#7c76ca03"` //nolint:revive // (opcode) should stay uninitialized
	QueryID    uint64           `tlb:"## 64"`
	To         *address.Address `tlb:"addr"`
	Bounceable bool             `tlb:"bool"`
	Value      tlb.Coins        `tlb:"."`
}

// traceTimeout bounds each WaitForTrace. The traces are a few hops long, so a trace that is not
// complete by then is one WaitForTrace cannot follow.
const traceTimeout = 45 * time.Second

// TestTraceAccountStates covers transactions executed by accounts that do not exist before or after
// them, which an observer cannot find through the account's current state.
func TestTraceAccountStates(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping long-running test in short mode")
	}

	accounts := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, big.NewInt(1_000_000_000_000), 4)
	code, err := wrappers.ParseCompiledContract(contracts.BuildPath("tests.mock.TraceProbe.compiled.json"))
	require.NoError(t, err)

	deployProbe := func(t *testing.T, acc *tracetracking.SignedAPIClient) *wrappers.Contract {
		t.Helper()
		data, err := tlb.ToCell(traceProbeStorage{QueryID: mathrand.Uint64()})
		require.NoError(t, err)
		probe, _, err := wrappers.Deploy(t.Context(), acc, code, data, tlb.MustFromTON("0.1"), tvm.EmptyCell)
		require.NoError(t, err)
		return probe
	}

	// call sends msg to probe and waits for the whole trace, returning the probe's handling of msg.
	call := func(t *testing.T, probe *wrappers.Contract, msg any) *tracetracking.ReceivedMessage {
		t.Helper()
		root, err := probe.CallWait(t.Context(), msg, tlb.MustFromTON("0.1"))
		require.NoError(t, err)

		ctx, cancel := context.WithTimeout(t.Context(), traceTimeout)
		defer cancel()
		require.NoError(t, root.WaitForTrace(ctx, probe.Client.Client))

		probeMsg := root.FindMessageTo(probe.Address)
		require.NotNil(t, probeMsg, "the probe's transaction is not in the trace")
		require.Equal(t, tvm.ExitCodeSuccess, must(probeMsg.ExitCode()))
		return probeMsg
	}

	// forwarded returns the single message the probe forwarded and asserts that it was handled by an
	// account that did not exist before, skipping the compute phase with skipReason.
	forwarded := func(t *testing.T, probeMsg *tracetracking.ReceivedMessage, to *address.Address, skipReason tvm.ExitCode) *tracetracking.ReceivedMessage {
		t.Helper()
		require.Len(t, probeMsg.OutgoingInternalReceivedMessages, 1)
		dstMsg := probeMsg.OutgoingInternalReceivedMessages[0]
		require.True(t, dstMsg.InternalMsg.DstAddr.Equals(to))
		require.EqualValues(t, tlb.AccountStatusNonExist, dstMsg.OrigStatus)
		require.Equal(t, skipReason, must(dstMsg.ExitCode()))
		return dstMsg
	}

	t.Run("SelfDestruct", func(t *testing.T) {
		t.Parallel()
		acc := &accounts[0]
		probe := deployProbe(t, acc)

		probeMsg := call(t, probe, traceProbeSelfDestruct{QueryID: mathrand.Uint64()})

		require.EqualValues(t, tlb.AccountStatusNonExist, probeMsg.EndStatus)
		require.Len(t, probeMsg.OutgoingInternalReceivedMessages, 1)
		refund := probeMsg.OutgoingInternalReceivedMessages[0]
		require.True(t, refund.InternalMsg.DstAddr.Equals(acc.Wallet.WalletAddress()))
	})

	t.Run("BounceableToNonexistentAccount", func(t *testing.T) {
		t.Parallel()
		probe := deployProbe(t, &accounts[1])
		to := randomAddress(t)

		probeMsg := call(t, probe, traceProbeForward{QueryID: mathrand.Uint64(), To: to, Bounceable: true, Value: tlb.MustFromTON("0.01")})

		dstMsg := forwarded(t, probeMsg, to, tvm.ExitCodeComputeSkipReasonNoState)
		require.EqualValues(t, tlb.AccountStatusNonExist, dstMsg.EndStatus)
		require.Len(t, dstMsg.OutgoingInternalReceivedMessages, 1)
		bounce := dstMsg.OutgoingInternalReceivedMessages[0]
		require.True(t, bounce.InternalMsg.Bounced)
		require.True(t, bounce.InternalMsg.DstAddr.Equals(probe.Address))
	})

	t.Run("NonBounceableToNonexistentAccount", func(t *testing.T) {
		t.Parallel()
		probe := deployProbe(t, &accounts[2])
		to := randomAddress(t)

		probeMsg := call(t, probe, traceProbeForward{QueryID: mathrand.Uint64(), To: to, Bounceable: false, Value: tlb.MustFromTON("0.01")})

		// The value creates the account, uninitialized.
		dstMsg := forwarded(t, probeMsg, to, tvm.ExitCodeComputeSkipReasonNoState)
		require.EqualValues(t, tlb.AccountStatusUninit, dstMsg.EndStatus)
		require.Empty(t, dstMsg.OutgoingInternalReceivedMessages)
	})

	t.Run("NonBounceableWithoutValueToNonexistentAccount", func(t *testing.T) {
		t.Parallel()
		probe := deployProbe(t, &accounts[3])
		to := randomAddress(t)

		probeMsg := call(t, probe, traceProbeForward{QueryID: mathrand.Uint64(), To: to, Bounceable: false, Value: tlb.ZeroCoins})

		// Without value, the message cannot pay for gas and the account is not created.
		dstMsg := forwarded(t, probeMsg, to, tvm.ExitCodeComputeSkipReasonNoGas)
		require.EqualValues(t, tlb.AccountStatusNonExist, dstMsg.EndStatus)
		require.Empty(t, dstMsg.OutgoingInternalReceivedMessages)
	})
}

// randomAddress returns a basechain address no account has been deployed at.
func randomAddress(t *testing.T) *address.Address {
	data := make([]byte, 32)
	_, err := rand.Read(data)
	require.NoError(t, err)
	return address.NewAddress(0, 0, data)
}
