package codec

import (
	"encoding/binary"
	"fmt"
	"reflect"
	"strings"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

const (
	tvmDestExecDataKey = "destGasAmount"

	// string representation of bytes4(keccak256("CCIP SVMExtraArgsV1"));
	svmExtraArgsTagStr = "0x1f3b3aba"

	// string representation of bytes4(keccak256("CCIP EVMExtraArgsV2"));
	evmExtraArgsTagStr = "0x181dcf10"

	// string representation of bytes4(keccak256("CCIP SuiExtraArgsV1"));
	suiExtraArgsTagStr = "0x21ea4ca9"
)

type extraDataDecoder struct{}

var _ ccipocr3.SourceChainExtraDataCodec = &extraDataDecoder{}

// NewExtraDataDecoder creates a new ExtraDataDecoder
func NewExtraDataDecoder() ccipocr3.SourceChainExtraDataCodec {
	return &extraDataDecoder{}
}

// extraArgsTypes maps tag hex strings to their corresponding struct types
var extraArgsTypes = map[string]reflect.Type{
	evmExtraArgsTagStr: reflect.TypeOf(onramp.GenericExtraArgsV2{}),
	svmExtraArgsTagStr: reflect.TypeOf(onramp.SVMExtraArgsV1{}),
	suiExtraArgsTagStr: reflect.TypeOf(onramp.SuiExtraArgsV1{}),
}

// DecodeExtraArgsToMap is a helper function for converting BOC encoded extra args bytes into map[string]any
func (d extraDataDecoder) DecodeExtraArgsToMap(extraArgs ccipocr3.Bytes) (map[string]any, error) {
	if len(extraArgs) < 4 {
		return nil, fmt.Errorf("extra args too short: %d, should be at least 4 (i.e the extraArgs tag)", len(extraArgs))
	}

	c, err := cell.FromBOC(extraArgs)
	if err != nil {
		return nil, fmt.Errorf("failed to decode BOC: %w", err)
	}

	tag, err := c.BeginParse().LoadSlice(32)
	if err != nil {
		return nil, fmt.Errorf("failed to load tag from cell: %w", err)
	}

	tagHex := hexutil.Encode(tag)
	argsType, ok := extraArgsTypes[tagHex]
	if !ok {
		return nil, fmt.Errorf("unknown extra args tag: %x", tag)
	}

	argsPtr := reflect.New(argsType)
	if err = tlb.LoadFromCell(argsPtr.Interface(), c.BeginParse()); err != nil {
		return nil, fmt.Errorf("failed to tlb load extra args from cell: %w", err)
	}

	val := argsPtr.Elem()
	outputMap := make(map[string]any)
	for i := 0; i < val.NumField(); i++ {
		field := argsType.Field(i)
		if !field.IsExported() {
			continue
		}
		if len(field.Name) > 0 {
			lowerCamelCase := strings.ToLower(field.Name[:1]) + field.Name[1:]
			outputMap[lowerCamelCase] = normalizeFieldValue(field, val.Field(i).Interface())
		}
	}

	return outputMap, nil
}

// normalizeFieldValue converts TL-B decoded types to the canonical types expected by
// downstream consumers in chainlink-ccip.
//
// The tonutils-go TL-B library has a limitation: the `bits N` tag only supports []byte,
// not fixed-size arrays like [32]byte — reflect.Value.Bytes() (used in serialization)
// panics on arrays. Similarly, SnakedCell[Account256] uses Account256{Value []byte} wrappers.
//
// However, the chainlink-ccip plugin expects:
//   - TokenReceiver as [32]byte (not []byte)
//   - Accounts/ReceiverObjectIDs as [][32]byte (not SnakedCell[Account256])
//
// This function bridges the gap by checking the struct tag: only []byte fields explicitly
// tagged with `tlb:"bits 256"` are converted to [32]byte. This avoids accidentally converting
// a variable-length []byte that happens to be 32 bytes at runtime.
//
// Verified: all []byte fields in the onramp bindings (SVMExtraArgsV1, SuiExtraArgsV1) are
// tagged with fixed `tlb:"bits N"` — there are no dynamically-sized []byte fields that could
// be misidentified.
func normalizeFieldValue(field reflect.StructField, val any) any {
	// Convert []byte with `tlb:"bits 256"` tag to [32]byte.
	// Only applies to fixed-size 256-bit fields (e.g. TokenReceiver, Account256.Value).
	if bs, ok := val.([]byte); ok && len(bs) == 32 {
		tag := field.Tag.Get("tlb")
		if tag == "bits 256" {
			var arr [32]byte
			copy(arr[:], bs)
			return arr
		}
	}

	// Convert SnakedCell[Account256] to [][32]byte.
	// Applies to SVMExtraArgsV1.Accounts and SuiExtraArgsV1.ReceiverObjectIDs.
	// Preserves nil semantics: a nil SnakedCell stays nil (not empty slice),
	// which can affect downstream nil checks and JSON encoding (null vs []).
	if accounts, ok := val.(common.SnakedCell[onramp.Account256]); ok {
		if accounts == nil {
			return ([][32]byte)(nil)
		}
		result := make([][32]byte, len(accounts))
		for i, acct := range accounts {
			if len(acct.Value) != 32 {
				return val // unexpected length, return as-is to avoid silent zero-padding
			}
			copy(result[i][:], acct.Value)
		}
		return result
	}

	return val
}

// DecodeDestExecDataToMap is a helper function for converting dest exec data bytes into map[string]any
func (d extraDataDecoder) DecodeDestExecDataToMap(destExecData ccipocr3.Bytes) (map[string]any, error) {
	return map[string]any{
		tvmDestExecDataKey: binary.BigEndian.Uint32(destExecData),
	}, nil
}

// Ensure ExtraDataDecoder implements the SourceChainExtraDataCodec interface
var _ ccipocr3.SourceChainExtraDataCodec = &extraDataDecoder{}
