package codec

import (
	"encoding/binary"
	"fmt"
	"reflect"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

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

// DecodeExtraArgsToMap is a helper function for converting Borsh encoded extra args bytes into map[string]any
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
		outputMap[field.Name] = val.Field(i).Interface()
	}

	return outputMap, nil
}

// DecodeDestExecDataToMap is a helper function for converting dest exec data bytes into map[string]any
func (d extraDataDecoder) DecodeDestExecDataToMap(destExecData ccipocr3.Bytes) (map[string]any, error) {
	return map[string]any{
		tvmDestExecDataKey: binary.BigEndian.Uint32(destExecData),
	}, nil
}

// Ensure ExtraDataDecoder implements the SourceChainExtraDataCodec interface
var _ ccipocr3.SourceChainExtraDataCodec = &extraDataDecoder{}
