package codec

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math/big"
	"reflect"
	"strings"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp"
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
	evmExtraArgsTagStr: reflect.TypeFor[onramp.GenericExtraArgsV2](),
	svmExtraArgsTagStr: reflect.TypeFor[onramp.SVMExtraArgsV1](),
	suiExtraArgsTagStr: reflect.TypeFor[onramp.SuiExtraArgsV1](),
}

// DecodeExtraArgsToMap is a helper function for converting BOC encoded extra args bytes into map[string]any
func (d extraDataDecoder) DecodeExtraArgsToMap(extraArgs ccipocr3.Bytes) (map[string]any, error) {
	if len(extraArgs) < 4 {
		return nil, fmt.Errorf("extra args too short: %d, should be at least 4 (i.e the extraArgs tag)", len(extraArgs))
	}

	c, err := fromBOC(extraArgs)
	if err != nil {
		return nil, fmt.Errorf("failed to decode BOC: %w", err)
	}

	s, err := c.BeginParse()
	if err != nil {
		return nil, fmt.Errorf("failed to begin parsing cell: %w", err)
	}
	tag, err := s.LoadSlice(32)
	if err != nil {
		return nil, fmt.Errorf("failed to load tag from cell: %w", err)
	}

	tagHex := hexutil.Encode(tag)
	argsType, ok := extraArgsTypes[tagHex]
	if !ok {
		return nil, fmt.Errorf("unknown extra args tag: %x", tag)
	}

	argsPtr := reflect.New(argsType)
	if err = tlb.Parse(argsPtr.Interface(), c); err != nil {
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
			normalized, err := normalizeFieldValue(field, val.Field(i).Interface())
			if err != nil {
				return nil, fmt.Errorf("failed to normalize %s: %w", field.Name, err)
			}
			outputMap[lowerCamelCase] = normalized
		}
	}

	return outputMap, nil
}

// normalizeFieldValue converts a TL-B decoded extra-args field into the shape
// chainlink-ccip consumers expect, rejecting values that cannot be represented.
// Every exported field passes through here, so it is also where validation lives.
//
// Two binding quirks force the conversions:
//   - `tlb:"bits N"` decodes to []byte, but consumers expect [32]byte for
//     TokenReceiver. Matching the tag keeps this to fields declared 256-bit,
//     rather than converting any []byte that happens to be 32 bytes long.
//   - SnakedCell[Account256] decodes to []Account256 with []byte values, but
//     consumers expect [][32]byte.
func normalizeFieldValue(field reflect.StructField, val any) (any, error) {
	// GasLimit is the only `maybe ## <bits>` field today. It decodes to a typed-nil
	// *big.Int when absent: the interface is non-nil while the pointer under it is,
	// which defeats the downstream `== nil` and `.(*big.Int)` checks.
	if gl, ok := val.(*big.Int); ok && gl == nil {
		return nil, errors.New("absent optional value (decoded as typed-nil *big.Int)")
	}

	// TokenReceiver / Account256.Value: []byte tagged `bits 256` -> [32]byte.
	if bs, ok := val.([]byte); ok && len(bs) == 32 && field.Tag.Get("tlb") == "bits 256" {
		var arr [32]byte
		copy(arr[:], bs)
		return arr, nil
	}

	// SVM Accounts / Sui ReceiverObjectIDs: []Account256 -> [][32]byte.
	// A nil cell stays nil rather than becoming an empty slice, since consumers
	// distinguish the two (null vs [] in JSON).
	if accounts, ok := val.(common.SnakedCell[onramp.Account256]); ok {
		if accounts == nil {
			return ([][32]byte)(nil), nil
		}
		result := make([][32]byte, len(accounts))
		for i, acct := range accounts {
			if len(acct.Value) != 32 {
				// A short element means the snake did not decode into complete
				// 256-bit values. Fail here rather than pad (which would change the
				// hash) or defer the error to a consumer mid-hash.
				return nil, fmt.Errorf("element %d has length %d, expected 32 bytes", i, len(acct.Value))
			}
			copy(result[i][:], acct.Value)
		}
		return result, nil
	}

	return val, nil
}

// DecodeDestExecDataToMap is a helper function for converting dest exec data bytes into map[string]any
func (d extraDataDecoder) DecodeDestExecDataToMap(destExecData ccipocr3.Bytes) (map[string]any, error) {
	return map[string]any{
		tvmDestExecDataKey: binary.BigEndian.Uint32(destExecData),
	}, nil
}

// Ensure ExtraDataDecoder implements the SourceChainExtraDataCodec interface
var _ ccipocr3.SourceChainExtraDataCodec = &extraDataDecoder{}
