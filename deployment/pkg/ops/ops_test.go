package ops

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

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
)

var unsupported = []uint32{
	0xD0984986, // feequoter.UpdateFeeTokens, requires dictionary surrogate
}

func TestIsSerializable_AllMessages(t *testing.T) {
	lggr, _ := logger.New()
	gen := utils.NewGenerator()

	for contract, tlbMap := range bindings.Registry {
		for opcode, proto := range tlbMap {
			if slices.Contains(unsupported, opcode) {
				t.Logf("skip serializability check for unsupported %s opcode=0x%08x (%T)", contract, opcode, proto)
				continue
			}

			sample, err := gen.Generate(proto)
			require.NoErrorf(t, err, "generating sample for %s opcode=0x%08x (%T)", contract, opcode, proto)
			assert.Equalf(t, true, operations.IsSerializable(lggr, sample), "operation should be serializable: contract=%s opcode=0x%08x type=%T", contract, opcode, sample)
		}
	}
}

func TestIsSerializable_AllMessageEnvelopes(t *testing.T) {
	lggr, _ := logger.New()
	gen := utils.NewGenerator()

	for contract, tlbMap := range bindings.Registry {
		for opcode, proto := range tlbMap {
			sample, err := gen.Generate(proto)
			if errors.Is(err, utils.ErrUnsupportedSample) {
				t.Logf("skip envelope serializable for %s opcode=0x%08x (%T): %v", contract, opcode, proto, err)
				continue
			}
			require.NoErrorf(t, err, "generating sample for %s opcode=0x%08x (%T)", contract, opcode, proto)

			envelope, err := codec.WrapMessage(contract, sample)
			require.NoErrorf(t, err, "wrap message failed: contract=%s opcode=0x%08x", contract, opcode)

			assert.Equalf(t, true, operations.IsSerializable(lggr, envelope), "envelope should be serializable: contract=%s opcode=0x%08x", contract, opcode)
		}
	}
}

func TestMessageEnvelope_SerializationRoundTrip(t *testing.T) {
	messageEnvelopeRoundTrip(t, 42, 50, true)
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
	gen := utils.NewGenerator(utils.WithRand(randSource))

	for contract, tlbMap := range bindings.Registry {

		toSequence := make([]codec.MessageEnvelope[any], 0)
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

				var decoded codec.MessageEnvelope[any]
				require.NoError(t, json.Unmarshal(raw, &decoded))
				err = decoded.LoadDecoded(bindings.Registry)
				require.NoError(t, err)

				rawDecoded, err := json.Marshal(decoded)
				require.NoError(t, err)

				assert.JSONEqf(t, string(raw), string(rawDecoded), "payload mismatch for contract=%s opcode=0x%08x", contract, opcode)
				assert.Equalf(t, true, operations.IsSerializable(lggr, envelope), "envelope serializable check failed: contract=%s opcode=0x%08x", contract, opcode)

				originalTLB, err := codec.EnsureTLBStructPointer(sample)
				require.NoErrorf(t, err, "original value is not a TL-B struct pointer: contract=%s opcode=0x%08x", contract, opcode)
				decodedTLB, err := codec.EnsureTLBStructPointer(*decoded.Value)
				require.NoErrorf(t, err, "decoded value is not a TL-B struct pointer: contract=%s opcode=0x%08x", contract, opcode)

				originalCell, err := tlb.ToCell(originalTLB)
				require.NoErrorf(t, err, "tlb.ToCell failed for original value: contract=%s opcode=0x%08x", contract, opcode)
				decodedCell, err := tlb.ToCell(decodedTLB)
				require.NoErrorf(t, err, "tlb.ToCell failed for decoded value: contract=%s opcode=0x%08x", contract, opcode)

				originalHash := originalCell.Hash()
				decodedHash := decodedCell.Hash()
				assert.Equalf(t, originalHash, decodedHash, "cell hash mismatch after round-trip: contract=%s opcode=0x%08x original=%x decoded=%x", contract, opcode, originalHash, decodedHash)

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
				require.NoError(t, os.WriteFile(file, []byte(builder.String()), 0o644))
			}
		}

		// Test sequence execution/planning with all messages for this contract
		testMakeExecuteSeq(t, contract, toSequence)
	}
}

func testMakeExecuteOp(t *testing.T, contract string, opcode uint32, decoded codec.MessageEnvelope[any]) operations.Report[SendMessageInput[any], SendMessageOutput] {
	t.Helper()

	// Setup execution environment
	lggr, _ := logger.New()
	rptr := operations.NewMemoryReporter()
	ctxFn := func() context.Context {
		return t.Context()
	}
	b := operations.NewBundle(ctxFn, lggr, rptr)
	deps := SendMessageDeps{
		Wallet: nil, // No actual sending in tests
	}

	r, err := operations.ExecuteOperation(b, SendMessage, deps, SendMessageInput[any]{
		Envelope: decoded,
		Plan:     true,
		DstAddr:  address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99"),
		Amount:   tlb.MustFromTON("0.25"),
	})
	assert.NotEmpty(t, r)
	assert.NoError(t, err)
	return r
}

func testMakeExecuteSeq(t *testing.T, contract string, envelopes []codec.MessageEnvelope[any]) {
	t.Helper()

	n := len(envelopes)
	defs := make([]operations.Definition, n)
	inputs := make([]any, n)

	for i, e := range envelopes {
		defs[i] = SendMessage.Def()
		inputs[i] = SendMessageInput[any]{
			Envelope: e,
			Plan:     true,
			DstAddr:  address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99"),
			Amount:   tlb.MustFromTON("0.25"),
		}
	}

	// Setup execution environment
	lggr, _ := logger.New()
	rptr := operations.NewMemoryReporter()
	ctxFn := func() context.Context {
		return t.Context()
	}

	ops := []*operations.Operation[any, any, any]{
		SendMessage.AsUntyped(),
	}
	opsr := operations.NewOperationRegistry(ops...)

	opts := []operations.BundleOption{
		operations.WithOperationRegistry(opsr),
	}
	b := operations.NewBundle(ctxFn, lggr, rptr, opts...)
	// Dependencies currently injected per-operation
	// TODO: generalize dependency injection per-type/s in sequences
	deps := AnySequenceDeps{}
	depsKey := SendMessage.Def().ID
	deps[depsKey] = SendMessageDeps{
		Wallet: nil, // No actual sending in tests
	}

	input := AnySequenceInput{
		Defs:   defs,
		Inputs: inputs,
	}
	r, err := operations.ExecuteSequence(b, AnySequence, deps, input)
	assert.NotEmpty(t, r)
	assert.NoError(t, err)
}
