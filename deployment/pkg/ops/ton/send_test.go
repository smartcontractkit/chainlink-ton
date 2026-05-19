package ton_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var unsupported = []uint64{
	0xD0984986,           // feequoter.UpdateFeeTokens, requires dictionary surrogate
	0xaf7a9ac6,           // router.RMNOwnableMessage, nested message envelope with generic parameter - not supported by current generator
	tvm.TLBMapKeyStorage, // special storage type key, not a message
}

// Test contract types
const PkgTest = "link.chain.ton.test"

// Sent back to sender after the executor role check is updated.
type TestMessage struct {
	_ tlb.Magic `tlb:"#c6d451e1" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change request.
	QueryID uint64 `tlb:"## 64"`

	Data *tlbe.Dict[uint16, common.AddressWrap] `tlb:"." json:"data"`
}

var TestTLBs = tvm.MustNewTLBMap([]any{
	TestMessage{},
})

func getRegistry() tvm.ContractTLBRegistry {
	r := bindings.Registry
	// Add test contract types
	r[PkgTest+".Foo"] = TestTLBs
	return r
}

func TestIsSerializable_AllMessages(t *testing.T) {
	lggr, _ := logger.New()
	gen := NewGenerator()

	for contract, tlbMap := range getRegistry() {
		for opcode, proto := range tlbMap {
			if slices.Contains(unsupported, opcode) {
				t.Logf("skip serializability check for unsupported %s opcode=0x%08x (%T)", contract, opcode, proto)
				continue
			}

			sample, err := gen.Generate(proto)
			require.NoErrorf(t, err, "generating sample for %s opcode=0x%08x (%T)", contract, opcode, proto)
			require.Truef(t, operations.IsSerializable(lggr, sample), "operation should be serializable: contract=%s opcode=0x%08x type=%T, sample=%+v", contract, opcode, sample, sample)
		}
	}
}

func TestIsSerializable_AllMessageEnvelopes(t *testing.T) {
	lggr, _ := logger.New()
	gen := NewGenerator()

	for contract, tlbMap := range getRegistry() {
		for opcode, proto := range tlbMap {
			if slices.Contains(unsupported, opcode) {
				t.Logf("skip serializability check for unsupported %s opcode=0x%08x (%T)", contract, opcode, proto)
				continue
			}

			sample, err := gen.Generate(proto)
			if errors.Is(err, ErrUnsupportedSample) {
				t.Logf("skip envelope serializable for %s opcode=0x%08x (%T): %v", contract, opcode, proto, err)
				continue
			}
			require.NoErrorf(t, err, "generating sample for %s opcode=0x%08x (%T)", contract, opcode, proto)

			envelope, err := codec.WrapMessage(contract, sample)
			require.NoErrorf(t, err, "wrap message failed: contract=%s opcode=0x%08x", contract, opcode)

			require.Truef(t, operations.IsSerializable(lggr, envelope), "envelope should be serializable: contract=%s opcode=0x%08x", contract, opcode)
		}
	}
}

func TestMessageEnvelope_SerializationRoundTrip(t *testing.T) {
	writeArtifacts := os.Getenv("WRITE_TEST_ARTIFACTS") == "1"
	messageEnvelopeRoundTrip(t, 42, 10, writeArtifacts)
}

func FuzzMessageEnvelope_SerializationRoundTrip(f *testing.F) {
	seeds := []int64{1, 42, -7, 1234567890, 9876543210}
	for _, seed := range seeds {
		f.Add(seed)
	}

	f.Fuzz(func(t *testing.T, seed int64) {
		messageEnvelopeRoundTrip(t, seed, 10, false)
	})
}

func messageEnvelopeRoundTrip(t *testing.T, seed int64, iterations int, writeArtifacts bool) {
	lggr, _ := logger.New()
	randSource := rand.New(rand.NewSource(seed))
	gen := NewGenerator(WithRand(randSource))

	for contract, tlbMap := range getRegistry() {
		toSequence := make([]*codec.MessageEnvelope[any], 0)
		for opcode, proto := range tlbMap {
			if slices.Contains(unsupported, opcode) {
				t.Logf("skip serializability check for unsupported %s opcode=0x%08x (%T)", contract, opcode, proto)
				continue
			}

			meta, err := codec.NewMessageMetaFromValue(contract, proto)
			require.NoErrorf(t, err, "creating message meta for %s opcode=0x%08x (%T)", contract, opcode, proto)

			var builder strings.Builder
			if writeArtifacts {
				builder.WriteString("[\n")
			}

			for i := 0; i < iterations; i++ {
				sample, err := gen.Generate(proto)
				require.NoErrorf(t, err, "generating sample for %s opcode=0x%08x (%T)", contract, opcode, proto)

				envelope, err := codec.WrapMessage(contract, sample)
				require.NoErrorf(t, err, "wrap message failed: contract=%s opcode=0x%08x", contract, opcode)

				raw, err := json.Marshal(envelope)
				require.NoError(t, err)

				if writeArtifacts {
					builder.WriteString("  ")
					builder.Write(raw)
					builder.WriteString(",\n")
				}

				var decoded *codec.MessageEnvelope[any]
				require.NoError(t, json.Unmarshal(raw, &decoded))
				err = codec.LoadNestedEnvelopes(decoded, bindings.Registry)
				require.NoError(t, err)

				rawDecoded, err := json.Marshal(decoded)
				require.NoError(t, err)

				require.JSONEqf(t, string(raw), string(rawDecoded), "payload mismatch for contract=%s opcode=0x%08x", contract, opcode)
				require.Truef(t, operations.IsSerializable(lggr, envelope), "envelope serializable check failed: contract=%s opcode=0x%08x", contract, opcode)

				originalTLB, err := codec.EnsureTLBStructPointer(sample)
				require.NoErrorf(t, err, "original value is not a TL-B struct pointer: contract=%s opcode=0x%08x", contract, opcode)
				decodedTLB, err := codec.EnsureTLBStructPointer(decoded.Value)
				require.NoErrorf(t, err, "decoded value is not a TL-B struct pointer: contract=%s opcode=0x%08x", contract, opcode)

				originalCell, err := tlb.ToCell(originalTLB)
				require.NoErrorf(t, err, "tlb.ToCell failed for original value: contract=%s opcode=0x%08x", contract, opcode)
				decodedCell, err := tlb.ToCell(decodedTLB)
				require.NoErrorf(t, err, "tlb.ToCell failed for decoded value: contract=%s opcode=0x%08x", contract, opcode)

				originalHash := originalCell.Hash()
				decodedHash := decodedCell.Hash()
				require.Equalf(t, originalHash, decodedHash, "cell hash mismatch after round-trip: contract=%s opcode=0x%08x original=%x decoded=%x", contract, opcode, originalHash, decodedHash)

				// Generate operation report
				r := testMakeExecuteOp(t, contract, opcode, decoded)

				// Accumulate for sequence testing
				toSequence = append(toSequence, decoded)

				rraw, err := json.Marshal(r)
				require.NoError(t, err)
				t.Log("--------------------")
				t.Log("Report output:")
				t.Log("Report JSON:", string(rraw))
				t.Log("--------------------")
			}

			if writeArtifacts {
				builder.WriteString("]\n")
				path := "generated/testdata/envelopes"
				file := fmt.Sprintf("%s/%s_%s_0x%08x.json", path, contract, meta.TypeName, opcode)
				require.NoError(t, os.MkdirAll(path, 0o755))
				require.NoError(t, os.WriteFile(file, []byte(builder.String()), 0o600))
			}
		}

		// Test sequence execution/planning with all messages for this contract
		testMakeExecuteSeq(t, contract, toSequence)
	}
}

func testMakeExecuteOp(t *testing.T, contract tvm.FullyQualifiedName, opcode uint64, decoded *codec.MessageEnvelope[any]) operations.Report[ton.SendMessagesInput, ton.SendMessagesOutput] {
	t.Helper()

	// Setup execution environment
	lggr, _ := logger.New()
	rptr := operations.NewMemoryReporter()
	ctxFn := func() context.Context {
		return t.Context()
	}
	b := operations.NewBundle(ctxFn, lggr, rptr)
	// Create the dependencies provider - supplies chain and other dependencies to ops/sequences
	dp, err := dep.NewDependencyProvider(
		dep.Provide(cldf_ton.Chain{}), // No actual sending in tests
	)
	require.NoError(t, err)

	r, err := operations.ExecuteOperation(b, ton.SendMessages, dp, ton.SendMessagesInput{
		Messages: []ton.InternalMessage[any]{
			{
				Body:    decoded,
				DstAddr: address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99"),
				Amount:  tlb.MustFromTON("0.25"),
				Bounce:  true,
			},
		},
		Plan: true,
	})
	require.NotEmpty(t, r)
	require.Len(t, r.Output.Plans, 1)
	require.NoError(t, err)
	return r
}

func testMakeExecuteSeq(t *testing.T, contract tvm.FullyQualifiedName, envelopes []*codec.MessageEnvelope[any]) {
	t.Helper()

	n := len(envelopes)
	defs := make([]operations.Definition, n)
	inputs := make([]any, n)

	for i, e := range envelopes {
		defs[i] = ton.SendMessages.Def()
		inputs[i] = ton.SendMessagesInput{
			Messages: []ton.InternalMessage[any]{
				{
					Body:    e,
					DstAddr: address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99"),
					Amount:  tlb.MustFromTON("0.25"),
					Bounce:  true,
				},
				{
					Body:    e,
					DstAddr: address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99"),
					Amount:  tlb.MustFromTON("0.25"),
					Bounce:  true,
				},
			},
			Plan: true,
		}
	}

	// Setup execution environment
	lggr, _ := logger.New()
	rptr := operations.NewMemoryReporter()
	ctxFn := func() context.Context {
		return t.Context()
	}

	opts := []operations.BundleOption{
		operations.WithOperationRegistry(ops.Registry),
	}
	b := operations.NewBundle(ctxFn, lggr, rptr, opts...)

	// Create the dependencies provider - supplies chain and other dependencies to ops/sequences
	dp, err := dep.NewDependencyProvider(
		dep.Provide(cldf_ton.Chain{}), // No actual sending in tests
	)
	require.NoError(t, err)

	input := ton.AnySequenceInput{
		Defs:   defs,
		Inputs: inputs,
	}
	r, err := operations.ExecuteSequence(b, ton.AnySequence, dp, input)
	require.NotEmpty(t, r)
	require.NoError(t, err)
}
