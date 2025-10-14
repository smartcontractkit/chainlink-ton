package lib

import (
	"encoding/json"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
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

type UnknownMessageError struct{}

func (e *UnknownMessageError) Error() string {
	return "unknown message"
}

type ContractDecoder interface {
	ContractType() cldf.ContractType
	InternalMessageInfo(body *cell.Cell) (MessageInfo, error)
	ExternalMessageInfo(body *cell.Cell) (MessageInfo, error)
	EventInfo(dstAddr *address.Address, msg *cell.Cell) (MessageInfo, error)
	ExitCodeInfo(exitCode tvm.ExitCode) (string, error)
}

func NewMessageInfo[T any](name string, msg T) (MessageInfo, error) {
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
