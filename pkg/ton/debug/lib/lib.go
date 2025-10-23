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
	typeName, m, err := DecodeJSONMapFromCell(t, msg, tlbs)
	if err != nil {
		return nil, fmt.Errorf("failed to decode message for contract %s: %w", t, err)
	}

	name := fmt.Sprintf("%s:%s", t, typeName)
	// 4.4 Finally, marshal the final map[string]interface{} as JSON string
	return NewMessageInfo(name, m)
}

// DecodeJSONMapFromCell attempts to decode the given cell using the provided TL-B candidates mapped by their opcodes.
func DecodeJSONMapFromCell(t cldf.ContractType, msg *cell.Cell, tlbs map[uint64]interface{}) (string, map[string]interface{}, error) {
	// 1.1 Try to decode *cell.Cell as one of the TLBs type by reading the opcode
	if msg == nil {
		return "", nil, &UnknownMessageError{}
	}

	r := msg.BeginParse()
	if r.BitsLeft() == 0 {
		return "", nil, &UnknownMessageError{}
	}
	opCode, err := r.PreloadUInt(32)
	if err != nil {
		return "", nil, fmt.Errorf("failed to preload opcode: %w", err)
	}

	i, ok := tlbs[opCode]
	if !ok {
		return "", nil, &UnknownMessageError{}
	}

	// create new instance of the candidate type
	rt := reflect.TypeOf(i)
	inst := reflect.New(rt).Interface() // pointer to zero value

	// attempt decode - replace tlb.FromCell with the actual decode API you have
	if err := tlb.LoadFromCell(inst, r); err != nil {
		return "", nil, fmt.Errorf("failed to decode message for opcode 0x%X: %w", opCode, err)
	}

	// Now decode internal *cell.Cell fields recursively
	// 2.1. Iterate over the fields of the struct (reflect)
	ckeys := make([]string, 0)
	for i := 0; i < rt.NumField(); i++ {
		f := rt.Field(i)

		// 2.2. For each field, check if it's of type *cell.Cell
		if f.Type == reflect.TypeOf(&cell.Cell{}) {
			// 2.3. If so, check the json tag to determine the expected key
			k := f.Name
			jsonTag := f.Tag.Get("json")
			if jsonTag != "" {
				k = strings.Split(jsonTag, ",")[0] // parse json tag options (key)
			}

			// 2.4. Source a set of keys that we need to decode recursively
			ckeys = append(ckeys, k)
		}
	}

	// 3.1. Decode the struct as JSON map[string]interface{} (default *cell.Cell marshalling)
	var rawMap map[string]interface{}
	rawBytes, err := json.Marshal(inst)
	if err != nil {
		return "", nil, fmt.Errorf("failed to marshal decoded message to JSON: %w", err)
	}
	err = json.Unmarshal(rawBytes, &rawMap)
	if err != nil {
		return "", nil, fmt.Errorf("failed to unmarshal decoded message JSON to map: %w", err)
	}

	// 3.2. For each key in the sourced set, get the *cell.Cell value (decode from BOC)
	for _, ck := range ckeys {
		cBOC := rawMap[ck]

		cVal := &cell.Cell{}
		if err := json.Unmarshal([]byte(strconv.Quote(cBOC.(string))), cVal); err != nil {
			return "", nil, fmt.Errorf("failed to unmarshal BOC to cell: %s: %s: %w", ck, cBOC, err)
		}

		// 3.3. Try to decode recursively using NewMessageInfoFromCell
		_, cMap, err := DecodeJSONMapFromCell(t, cVal, tlbs)
		if err != nil {
			// 	fallback to original BOC representation if fails
			continue
		}
		rawMap[ck] = cMap
	}

	return rt.Name(), rawMap, nil
	// 4.4 Finally, marshal the final map[string]interface{} as JSON string
}

func MustNewTLBMap(types []interface{}) map[uint64]interface{} {
	tlbs, err := NewTLBMap(types)
	if err != nil {
		panic(fmt.Errorf("failed to create TLB map: %w", err))
	}
	return tlbs
}

// NewTLBMap creates a map of TL-B magic numbers (opcodes) to their corresponding types
// from a set of TL-B annotated struct instances.
func NewTLBMap(types []interface{}) (map[uint64]interface{}, error) {
	tlbs := make(map[uint64]interface{})
	for _, typ := range types {
		// Use reflection to get the magic number from the type
		rt := reflect.TypeOf(typ)

		if rt.Field(0).Type != reflect.TypeOf(tlb.Magic{}) {
			return nil, fmt.Errorf("first field of %s is not of type Magic", rt.Name())
		}

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
