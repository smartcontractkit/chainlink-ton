package lib

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
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
func NewMessageInfoFromCell(t cldf.ContractType, msg *cell.Cell, tlbs map[uint64]interface{}) (MessageInfo, error) {
	r := msg.BeginParse()
	if r.BitsLeft() == 0 {
		return nil, &UnknownMessageError{}
	}
	opCode, err := r.PreloadUInt(32)
	if err != nil {
		return nil, fmt.Errorf("failed to preload opcode: %w", err)
	}

	i, ok := tlbs[opCode]
	if !ok {
		return nil, &UnknownMessageError{}
	}

	// create new instance of the candidate type
	rt := reflect.TypeOf(i)
	inst := reflect.New(rt).Interface() // pointer to zero value

	// attempt decode - replace tlb.FromCell with the actual decode API you have
	if err := tlb.LoadFromCell(inst, r); err != nil {
		return nil, fmt.Errorf("failed to decode OnRamp message for opcode 0x%X: %w", opCode, err)
	}

	name := fmt.Sprintf("%s:%s", t, rt.Name())
	return NewMessageInfo(name, inst)
}

func MustNewTLBMap(types []interface{}) map[uint64]interface{} {
	tlbs, err := NewTLBMap(types)
	if err != nil {
		panic(fmt.Errorf("failed to create TLB map: %w", err))
	}
	return tlbs
}

// NewTLBMap creates a map of TL-B magic numbers to their corresponding types.
// The input is a slice of TL-B struct instances.
func NewTLBMap(types []interface{}) (map[uint64]interface{}, error) {
	tlbs := make(map[uint64]interface{})
	for _, typ := range types {
		// Use reflection to get the magic number from the type
		rt := reflect.TypeOf(typ)

		magicTag := rt.Field(0).Tag.Get("tlb")
		magic, err := loadMagic(magicTag)
		if err != nil {
			return nil, fmt.Errorf("failed to load magic from tag %s: %w", magicTag, err)
		}

		tlbs[magic] = typ
	}
	return tlbs, nil
}

// Notice: func extracted from tonutils-go tlb package
func loadMagic(tag string) (uint64, error) {
	var sz, base int
	if strings.HasPrefix(tag, "#") {
		base = 16
		sz = (len(tag) - 1) * 4
	} else if strings.HasPrefix(tag, "$") {
		base = 2
		sz = len(tag) - 1
	} else {
		return 0, fmt.Errorf("unknown magic value type in tag: %s", tag)
	}

	if sz > 64 {
		return 0, fmt.Errorf("too big magic value type in tag")
	}

	magic, err := strconv.ParseInt(tag[1:], base, 64)
	if err != nil {
		return 0, fmt.Errorf("corrupted magic value in tag")
	}
	return uint64(magic), nil
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
