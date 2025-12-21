package lib

// import (
// 	"encoding/json"
// 	"errors"

// 	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
// 	"github.com/smartcontractkit/chainlink-ton/pkg/ton/jsoncodec"
// 	"github.com/xssnick/tonutils-go/tvm/cell"
// )

// var messageCodec = jsoncodec.NewCodec(jsoncodec.WithCellPresenter(presentCell))

// func MarshalWithSurrogates(value any) (json.RawMessage, error) {
// 	return messageCodec.Marshal(value)
// }

// func UnmarshalWithSurrogates(payload json.RawMessage, target any) error {
// 	return messageCodec.Unmarshal(payload, target)
// }

// func presentCell(c *cell.Cell) (jsoncodec.CellPresentation, error) {
// 	if c == nil {
// 		return jsoncodec.CellPresentation{}, nil
// 	}

// 	tlbMap := bindings.Registry.Snapshot()
// 	if len(tlbMap) == 0 {
// 		return jsoncodec.CellPresentation{}, nil
// 	}

// 	typeName, decoded, err := DecodeTLBValToJSON(c, tlbMap)
// 	if err != nil {
// 		var unknown *UnknownMessageError
// 		if !errors.As(err, &unknown) {
// 			// Surface unexpected errors for visibility, but fall back without blocking serialization.
// 			return jsoncodec.CellPresentation{}, nil
// 		}
// 		return jsoncodec.CellPresentation{}, nil
// 	}

// 	if decoded == nil {
// 		return jsoncodec.CellPresentation{}, nil
// 	}

// 	return jsoncodec.CellPresentation{
// 		Type:       typeName,
// 		Value:      decoded,
// 		Normalized: true,
// 	}, nil
// }
