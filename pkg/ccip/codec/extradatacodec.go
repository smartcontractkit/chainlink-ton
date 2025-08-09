package codec

import (
	"bytes"
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
)

var (
	// bytes4(keccak256("CCIP SVMExtraArgsV1"));
	svmExtraArgsV1Tag = hexutil.MustDecode("0x1f3b3aba")

	// bytes4(keccak256("CCIP EVMExtraArgsV2"));
	evmExtraArgsV2Tag = hexutil.MustDecode("0x181dcf10")
)

// ExtraDataDecoder is a helper struct for decoding extra data
type ExtraDataDecoder struct{}

// DecodeExtraArgsToMap is a helper function for converting Borsh encoded extra args bytes into map[string]any
func (d ExtraDataDecoder) DecodeExtraArgsToMap(extraArgs ccipocr3.Bytes) (map[string]any, error) {
	if len(extraArgs) < 4 {
		return nil, fmt.Errorf("extra args too short: %d, should be at least 4 (i.e the extraArgs tag)", len(extraArgs))
	}

	var val reflect.Value
	var typ reflect.Type
	outputMap := make(map[string]any)
	c, err := cell.FromBOC(extraArgs)
	if err != nil {
		return outputMap, fmt.Errorf("failed to decode BOC: %w", err)
	}
	tag, err := c.BeginParse().LoadSlice(32)
	if err != nil {
		return outputMap, fmt.Errorf("failed to load tag from cell: %w", err)
	}

	if bytes.Equal(tag, evmExtraArgsV2Tag) {
		var args onramp.GenericExtraArgsV2
		if err = tlb.LoadFromCell(&args, c.BeginParse()); err != nil {
			return nil, fmt.Errorf("failed to tlb load extra args from cell: %w", err)
		}

		val = reflect.ValueOf(args)
		typ = reflect.TypeOf(args)
	} else if bytes.Equal(tag, svmExtraArgsV1Tag) {
		var tlbArgs onramp.SVMExtraArgsV1
		if err = tlb.LoadFromCell(&tlbArgs, c.BeginParse()); err != nil {
			return nil, fmt.Errorf("failed to tlb load extra args from cell: %w", err)
		}

		val = reflect.ValueOf(tlbArgs)
		typ = reflect.TypeOf(tlbArgs)
	} else {
		return nil, fmt.Errorf("unknown extra args tag: %x", tag)
	}

	for i := 0; i < val.NumField(); i++ {
		field := typ.Field(i)
		fieldValue := val.Field(i).Interface()
		outputMap[field.Name] = fieldValue
	}

	return outputMap, nil
}

// DecodeDestExecDataToMap is a helper function for converting dest exec data bytes into map[string]any
func (d ExtraDataDecoder) DecodeDestExecDataToMap(destExecData ccipocr3.Bytes) (map[string]any, error) {
	return map[string]any{
		tvmDestExecDataKey: binary.BigEndian.Uint32(destExecData),
	}, nil
}

// Ensure ExtraDataDecoder implements the SourceChainExtraDataCodec interface
var _ ccipocr3.SourceChainExtraDataCodec = &ExtraDataDecoder{}
