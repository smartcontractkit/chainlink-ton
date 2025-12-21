package deployment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"slices"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
)

var dictionaryPtrType = reflect.TypeOf((*cell.Dictionary)(nil))

var unsupported = []uint32{
	0xD0984986, // feequoter.UpdateFeeTokens, requires dictionary surrogate
}

func TestIsSerializable_AllContractMessages(t *testing.T) {
	lggr, _ := logger.New()
	gen := NewGenerator()

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

func TestMessageEnvelope_SerializationRoundTrip(t *testing.T) {
	lggr, _ := logger.New()
	gen := NewGenerator()

	iter := 100

	for contract, tlbMap := range bindings.Registry {
		for opcode, proto := range tlbMap {
			if slices.Contains(unsupported, opcode) {
				t.Logf("skip serializability check for unsupported %s opcode=0x%08x (%T)", contract, opcode, proto)
				continue
			}

			meta, err := lib.NewMessageMetaFromValue(contract, proto)
			require.NoErrorf(t, err, "creating message meta for %s opcode=0x%08x (%T)", contract, opcode, proto)
			file := fmt.Sprintf("generated/testdata/envelopes/%s_%s_0x%08x.json", contract, meta.TypeName, opcode)
			jsonBlob := "[\n"

			for i := 0; i < iter; i++ {
				sample, err := gen.Generate(proto)
				require.NoErrorf(t, err, "generating sample for %s opcode=0x%08x (%T)", contract, opcode, proto)

				envelope, err := lib.WrapMessage(contract, sample)
				require.NoErrorf(t, err, "wrap message failed: contract=%s opcode=0x%08x", contract, opcode)

				// Marshal to JSON
				raw, err := json.Marshal(envelope)
				require.NoError(t, err)
				// Append to big Pretty JSON blob which we write to file analyze after test
				jsonBlob += "  " + string(raw) + ",\n"

				var decoded lib.MessageEnvelope[any]
				require.NoError(t, json.Unmarshal(raw, &decoded))
				err = decoded.LoadDecoded(bindings.Registry)
				require.NoError(t, err)

				rawDecoded, err := json.Marshal(decoded)
				require.NoError(t, err)

				assert.JSONEqf(t, string(raw), string(rawDecoded), "payload mismatch for contract=%s opcode=0x%08x", contract, opcode)
				assert.Equalf(t, true, operations.IsSerializable(lggr, envelope), "envelope serializable check failed: contract=%s opcode=0x%08x", contract, opcode)

				// Verify round-trip cell hash integrity
				originalTLB, err := lib.EnsureTLBStructPointer(sample)
				require.NoErrorf(t, err, "original value is not a TL-B struct pointer: contract=%s opcode=0x%08x", contract, opcode)
				decodedTLB, err := lib.EnsureTLBStructPointer(*decoded.Value)
				require.NoErrorf(t, err, "decoded value is not a TL-B struct pointer: contract=%s opcode=0x%08x", contract, opcode)

				originalCell, err := tlb.ToCell(originalTLB)
				require.NoErrorf(t, err, "tlb.ToCell failed for original value: contract=%s opcode=0x%08x", contract, opcode)
				decodedCell, err := tlb.ToCell(decodedTLB)
				require.NoErrorf(t, err, "tlb.ToCell failed for decoded value: contract=%s opcode=0x%08x", contract, opcode)

				originalHash := originalCell.Hash()
				decodedHash := decodedCell.Hash()
				assert.Equalf(t, originalHash, decodedHash, "cell hash mismatch after round-trip: contract=%s opcode=0x%08x original=%x decoded=%x", contract, opcode, originalHash, decodedHash)

				// Generate an operation and execute
				r := makeExecuteOp(t, contract, opcode, decoded)

				rraw, err := json.Marshal(r)
				require.NoError(t, err)
				t.Log("--------------------")
				t.Log("Report output:")
				t.Log("Report JSON:", string(rraw))
				t.Log("--------------------")
			}

			jsonBlob += "]\n"
			// Save to file for analysis (create if not exists)
			require.NoError(t, os.MkdirAll("generated/testdata/envelopes", 0o755))
			require.NoError(t, os.WriteFile(file, []byte(jsonBlob), 0o644))
		}
	}
}

func makeExecuteOp(t *testing.T, contract string, opcode uint32, decoded lib.MessageEnvelope[any]) operations.Report[MessageOpInput[any], MessageOpOutput] {
	t.Helper()

	op := NewMessageOp[any](OpOpts{
		Version: semver.MustParse("0.1.0"),
		Name:    fmt.Sprintf("op:%s:0x%08x", contract, opcode),
		Desc:    "An operation generated during testing from message envelope",
	})
	assert.NotEmpty(t, op)

	lggr, _ := logger.New()
	rptr := operations.NewMemoryReporter()
	ctxFn := func() context.Context {
		return t.Context()
	}
	b := operations.NewBundle(ctxFn, lggr, rptr)
	deps := MessageOpDeps{
		Wallet: nil, // No actual sending in tests
	}
	r, err := operations.ExecuteOperation(b, op, deps, MessageOpInput[any]{
		Envelope: decoded,
		Plan:     true,
		DstAddr:  address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99"),
		Amount:   tlb.MustFromTON("0.25"),
	})
	assert.NotEmpty(t, r)
	assert.NoError(t, err)
	return r
}

func TestMessageEnvelope_IsSerializable(t *testing.T) {
	lggr, _ := logger.New()
	gen := NewGenerator()

	for contract, tlbMap := range bindings.Registry {
		for opcode, proto := range tlbMap {
			sample, err := gen.Generate(proto)
			if errors.Is(err, ErrUnsupportedSample) {
				t.Logf("skip envelope serializable for %s opcode=0x%08x (%T): %v", contract, opcode, proto, err)
				continue
			}
			require.NoErrorf(t, err, "generating sample for %s opcode=0x%08x (%T)", contract, opcode, proto)

			envelope, err := lib.WrapMessage(contract, sample)
			require.NoErrorf(t, err, "wrap message failed: contract=%s opcode=0x%08x", contract, opcode)

			assert.Equalf(t, true, operations.IsSerializable(lggr, envelope), "envelope should be serializable: contract=%s opcode=0x%08x", contract, opcode)
		}
	}
}

// func FuzzDictionarySurrogate(f *testing.F) {
// 	f.Add(uint8(4), uint32(1), uint32(2))

// 	f.Fuzz(func(t *testing.T, keyBits uint8, key uint32, value uint32) {
// 		if keyBits == 0 {
// 			t.Skip("key bits cannot be zero")
// 		}

// 		if keyBits > 32 {
// 			keyBits = keyBits%32 + 1
// 		}

// 		dict := cell.NewDict(uint(keyBits))
// 		keyBuilder := cell.BeginCell()
// 		keyMask := uint64(1<<keyBits) - 1
// 		keyBuilder.MustStoreUInt(uint64(key)&keyMask, uint(keyBits))

// 		valueBuilder := cell.BeginCell()
// 		valueBuilder.MustStoreUInt(uint64(value), 32)

// 		require.NoError(t, dict.Set(keyBuilder.EndCell(), valueBuilder.EndCell()))

// 		payload, err := lib.MarshalWithSurrogates(dict)
// 		require.NoError(t, err)

// 		var restored *cell.Dictionary
// 		require.NoError(t, lib.UnmarshalWithSurrogates(payload, &restored))
// 		require.NotNil(t, restored)

// 		roundTrip, err := lib.MarshalWithSurrogates(restored)
// 		require.NoError(t, err)

// 		assert.JSONEq(t, string(payload), string(roundTrip))
// 	})
// }
