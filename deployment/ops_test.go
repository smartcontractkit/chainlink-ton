package deployment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
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

type Foo struct {
	_   tlb.Magic  `tlb:"#00000001" json:"-"` //nolint:revive // Ignore opcode tag
	Any *cell.Cell `tlb:"^"`
}

var FooOp = NewMessageOp[Foo](OpOpts{
	Version: semver.MustParse("0.1.0"),
	Name:    "foo-op",
	Desc:    "An example operation with Foo message",
})

func deployTONContract(b operations.Bundle, deps MessageOpDeps, in MessageOpInput[Foo]) (MessageOpOutput, error) {
	operations.ExecuteOperation(b, FooOp, deps, MessageOpInput[Foo]{
		Envelope: in.Envelope,
		Plan:     in.Plan,
	})

	// Implement the deployment logic here
	return MessageOpOutput{}, nil
}

func TestIsSerializable_AllContractMessages(t *testing.T) {
	lggr, _ := logger.New()
	gen := NewGenerator()

	for contract, tlbMap := range bindings.TypeToTLBMap {
		for opcode, proto := range tlbMap {
			sample, err := gen.Generate(proto)
			if errors.Is(err, ErrUnsupportedSample) {
				t.Logf("skip serializability check for %s opcode=0x%08x (%T): %v", contract, opcode, proto, err)
				continue
			}
			require.NoErrorf(t, err, "generating sample for %s opcode=0x%08x (%T)", contract, opcode, proto)

			if requiresDictionarySurrogate(sample) {
				t.Logf("sample for %s opcode=0x%08x requires dictionary surrogate", contract, opcode)
				require.NotEmpty(t, canonicalPayload(t, sample))
				continue
			}

			assert.Equalf(t, true, operations.IsSerializable(lggr, sample), "operation should be serializable: contract=%s opcode=0x%08x type=%T", contract, opcode, sample)
		}
	}
}

func TestMessageEnvelope_SerializationRoundTrip(t *testing.T) {
	for contract, tlbMap := range bindings.TypeToTLBMap {
		require.NoError(t, lib.RegisterTLBOperations(contract, tlbMap))
	}

	lggr, _ := logger.New()
	gen := NewGenerator()

	iter := 100

	for contract, tlbMap := range bindings.TypeToTLBMap {
		for opcode, proto := range tlbMap {
			file := fmt.Sprintf("generated/testdata/envelopes/%s_0x%08x.json", contract, opcode)
			jsonBlob := "[\n"

			for i := 0; i < iter; i++ {
				sample, err := gen.Generate(proto)

				t.Logf("Testing contract=%s opcode=0x%08x iteration=%d", contract, opcode, i+1)
				t.Logf("Sample value: %#v", sample)

				if errors.Is(err, ErrUnsupportedSample) {
					t.Logf("skip envelope round-trip for %s opcode=0x%08x (%T): %v", contract, opcode, proto, err)
					continue
				}
				require.NoErrorf(t, err, "generating sample for %s opcode=0x%08x (%T)", contract, opcode, proto)

				// if requiresDictionarySurrogate(sample) {
				// 	t.Logf("sample for %s opcode=0x%08x requires dictionary surrogate", contract, opcode)
				// 	assert.Equalf(t, false, operations.IsSerializable(lggr, sample), "dictionary-backed sample should fail direct serializability check: contract=%s opcode=0x%08x", contract, opcode)
				// } else {
				// 	require.Equalf(t, true, operations.IsSerializable(lggr, sample), "sample should be serializable: contract=%s opcode=0x%08x", contract, opcode)
				// }

				envelope, err := lib.WrapMessage(contract, sample)
				require.NoErrorf(t, err, "wrap message failed: contract=%s opcode=0x%08x", contract, opcode)

				t.Logf("Sample JSON: %s", canonicalPayload(t, sample))

				// Append to big Pretty JSON blob which we write to file analyze after test
				jsonBlob += "  " + canonicalPayload(t, envelope) + ",\n"

				// Marshal to JSON

				raw, err := json.Marshal(envelope)
				require.NoError(t, err)
				require.NotContains(t, string(raw), "OpCode")

				samplePayload := canonicalPayload(t, sample)
				t.Logf("\ncontract=%s type=%T sample=%s", contract, sample, samplePayload)

				var decoded lib.MessageEnvelope[any]
				require.NoError(t, json.Unmarshal(raw, &decoded))

				decodedValue, err := decoded.Decode()
				require.NoError(t, err)

				decodedPayload := canonicalPayload(t, decodedValue)

				assert.JSONEqf(t, samplePayload, decodedPayload, "payload mismatch for contract=%s opcode=0x%08x", contract, opcode)
				assert.Equalf(t, true, operations.IsSerializable(lggr, envelope), "envelope serializable check failed: contract=%s opcode=0x%08x", contract, opcode)

				// Verify round-trip cell hash integrity
				originalTLB, err := lib.EnsureTLBStructPointer(sample)
				require.NoErrorf(t, err, "original value is not a TL-B struct pointer: contract=%s opcode=0x%08x", contract, opcode)
				decodedTLB, err := lib.EnsureTLBStructPointer(decodedValue)
				require.NoErrorf(t, err, "decoded value is not a TL-B struct pointer: contract=%s opcode=0x%08x", contract, opcode)

				originalCell, err := tlb.ToCell(originalTLB)
				require.NoErrorf(t, err, "tlb.ToCell failed for original value: contract=%s opcode=0x%08x", contract, opcode)
				decodedCell, err := tlb.ToCell(decodedTLB)
				require.NoErrorf(t, err, "tlb.ToCell failed for decoded value: contract=%s opcode=0x%08x", contract, opcode)

				originalHash := originalCell.Hash()
				decodedHash := decodedCell.Hash()
				assert.Equalf(t, originalHash, decodedHash, "cell hash mismatch after round-trip: contract=%s opcode=0x%08x original=%x decoded=%x", contract, opcode, originalHash, decodedHash)

				// Generate an operation and execute
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

				rraw, err := json.Marshal(r)
				require.NoError(t, err)
				t.Log("--------------------")
				t.Log("Report output:")
				t.Log("Report JSON:", string(rraw))
				t.Log("--------------------")

				if requiresDictionarySurrogate(sample) {
					assert.Containsf(t, samplePayload, "keySize", "dictionary surrogate missing keySize for contract=%s opcode=0x%08x", contract, opcode)
					assert.Containsf(t, samplePayload, "boc", "dictionary surrogate missing boc for contract=%s opcode=0x%08x", contract, opcode)
				}
			}

			jsonBlob += "]\n"
			// Save to file for analysis (create if not exists)
			require.NoError(t, os.MkdirAll("generated/testdata/envelopes", 0o755))
			require.NoError(t, os.WriteFile(file, []byte(jsonBlob), 0o644))
		}
	}
}

func TestMessageEnvelope_IsSerializable(t *testing.T) {
	lggr, _ := logger.New()

	for contract, tlbMap := range bindings.TypeToTLBMap {
		require.NoError(t, lib.RegisterTLBOperations(contract, tlbMap))
	}

	gen := NewGenerator()

	for contract, tlbMap := range bindings.TypeToTLBMap {
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

func FuzzDictionarySurrogate(f *testing.F) {
	f.Add(uint8(4), uint32(1), uint32(2))

	f.Fuzz(func(t *testing.T, keyBits uint8, key uint32, value uint32) {
		if keyBits == 0 {
			t.Skip("key bits cannot be zero")
		}

		if keyBits > 32 {
			keyBits = keyBits%32 + 1
		}

		dict := cell.NewDict(uint(keyBits))
		keyBuilder := cell.BeginCell()
		keyMask := uint64(1<<keyBits) - 1
		keyBuilder.MustStoreUInt(uint64(key)&keyMask, uint(keyBits))

		valueBuilder := cell.BeginCell()
		valueBuilder.MustStoreUInt(uint64(value), 32)

		require.NoError(t, dict.Set(keyBuilder.EndCell(), valueBuilder.EndCell()))

		payload, err := lib.MarshalWithSurrogates(dict)
		require.NoError(t, err)

		var restored *cell.Dictionary
		require.NoError(t, lib.UnmarshalWithSurrogates(payload, &restored))
		require.NotNil(t, restored)

		roundTrip, err := lib.MarshalWithSurrogates(restored)
		require.NoError(t, err)

		assert.JSONEq(t, string(payload), string(roundTrip))
	})
}

func requiresDictionarySurrogate(value any) bool {
	return inspectForDictionary(reflect.ValueOf(value), map[uintptr]struct{}{})
}

func inspectForDictionary(val reflect.Value, visited map[uintptr]struct{}) bool { //nolint:cyclop
	if !val.IsValid() {
		return false
	}

	if val.Type() == dictionaryPtrType {
		return !val.IsNil()
	}

	switch val.Kind() { //nolint:exhaustive
	case reflect.Pointer:
		if val.IsNil() {
			return false
		}

		addr := val.Pointer()
		if addr != 0 {
			if _, ok := visited[addr]; ok {
				return false
			}
			visited[addr] = struct{}{}
		}

		return inspectForDictionary(val.Elem(), visited)
	case reflect.Struct:
		for i := 0; i < val.NumField(); i++ {
			field := val.Type().Field(i)
			if !field.IsExported() {
				continue
			}
			if inspectForDictionary(val.Field(i), visited) {
				return true
			}
		}
		return false
	case reflect.Map:
		iter := val.MapRange()
		for iter.Next() {
			if inspectForDictionary(iter.Value(), visited) {
				return true
			}
		}
		return false
	case reflect.Slice, reflect.Array:
		for i := 0; i < val.Len(); i++ {
			if inspectForDictionary(val.Index(i), visited) {
				return true
			}
		}
		return false
	case reflect.Interface:
		if val.IsNil() {
			return false
		}
		return inspectForDictionary(val.Elem(), visited)
	default:
		return false
	}
}

func canonicalPayload(t *testing.T, value any) string {
	t.Helper()

	payload, err := lib.MarshalWithSurrogates(value)
	require.NoError(t, err)
	return string(payload)
}
