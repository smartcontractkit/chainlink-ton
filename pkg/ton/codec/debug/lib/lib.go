package lib

import (
	"encoding/json"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

type TxInfo struct {
	Msg      MessageInfo
	ExitCode string
}

// Describes a decoded message or event.
//
// - Name is a short name of the message/event type.
// - Body carries the contents of the message/event in both compact and detailed forms.
type MessageInfo interface {
	Name() string
	Body() BodyInfo
}

// BodyInfo describes the contents of a message or event.
//
// - Compact is a single-line representation.
// - Describe is a pretty-printed, multi-line representation.
type BodyInfo interface {
	Compact() string
	Describe() string
}

type ContractDecoder interface {
	ContractType() tvm.FullyQualifiedName
	InternalMessageInfo(body *cell.Cell) (MessageInfo, error)
	ExternalMessageInfo(body *cell.Cell) (MessageInfo, error)
	EventInfo(dstAddr *address.Address, msg *cell.Cell) (MessageInfo, error)
	ExitCodeInfo(exitCode tvm.ExitCode) (string, error)
}

func NewMessageInfo(name string, msg any) (MessageInfo, error) {
	short, err := json.Marshal(msg)
	if err != nil {
		return nil, err
	}
	long, err := json.MarshalIndent(msg, "", "  ")
	if err != nil {
		return nil, err
	}
	return messageInfo{
		name:  name,
		short: string(short),
		long:  string(long),
	}, nil
}

// NewMessageInfoFromCell attempts to decode the given cell using the provided TL-B candidates mapped by their opcodes.
func NewMessageInfoFromCell(t tvm.FullyQualifiedName, msg *cell.Cell, tlbs tvm.TLBMap, tlbsCtx tvm.TLBMap) (MessageInfo, error) {
	typeName, norm, err := codec.DecodeTLBValToJSON(msg, tlbs)
	if err != nil {
		return nil, fmt.Errorf("failed to decode message for contract %s: %w", t, err)
	}

	if typeName == "Cell" { // on decoder fallback (not decoded)
		return nil, codec.ErrUnknownMessage
	}

	// Second round of decoding - internal payloads using TLBs from loaded context
	_, norm, err = codec.DecodeTLBValToJSON(norm, tlbsCtx)
	if err != nil {
		return nil, fmt.Errorf("failed to decode message for contract %s: %w", t, err)
	}

	name := fmt.Sprintf("%s:%s", t, typeName)
	// Marshal the final normalized map[string]any as JSON string
	return NewMessageInfo(name, norm)
}

type messageInfo struct {
	name  string
	short string
	long  string
}

// Body implements lib.MessageInfo.
func (m messageInfo) Body() BodyInfo {
	return m
}

// Name implements lib.MessageInfo.
func (m messageInfo) Name() string {
	return m.name
}

func (m messageInfo) Compact() string {
	return m.short
}

func (m messageInfo) Describe() string {
	return m.long
}

type Wrapper struct {
	Type  string
	Value any
}

func (w Wrapper) MarshalJSON() ([]byte, error) {
	// Marshal the Value first
	valueJSON, err := json.Marshal(w.Value)
	if err != nil {
		return nil, err
	}

	// Build an object like: {"<Type>": <valueJSON>}
	// Note: json.Marshal needs a map[string]json.RawMessage
	obj := map[string]json.RawMessage{
		w.Type: valueJSON,
	}
	return json.Marshal(obj)
}
