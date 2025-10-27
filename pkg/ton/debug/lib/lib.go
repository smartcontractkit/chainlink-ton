package lib

import (
	"encoding/json"
	"errors"
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
	typeName, m, err := DecodeTLBValToJSON(msg, tlbs)
	if err != nil {
		return nil, fmt.Errorf("failed to decode message for contract %s: %w", t, err)
	}

	name := fmt.Sprintf("%s:%s", t, typeName)
	// 4.4 Finally, marshal the final map[string]interface{} as JSON string
	return NewMessageInfo(name, m)
}

func DecodeTLBStructToJSON(v interface{}, tlbs map[uint64]interface{}) (string, map[string]interface{}, error) {
	switch t := v.(type) {
	case nil:
		return "", nil, errors.New("can't decode nil as struct")
	case *cell.Cell:
		// Try to decode *cell.Cell as one of the TLBs type by reading the opcode
		r := t.BeginParse()
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

		// Create new instance of the candidate type
		rt := reflect.TypeOf(i)
		inst := reflect.New(rt).Interface() // pointer to zero value

		// Attempt decode - replace tlb.FromCell with the actual decode API you have
		if err = tlb.LoadFromCell(inst, r); err != nil {
			return "", nil, fmt.Errorf("failed to decode message for opcode 0x%X: %w", opCode, err)
		}

		// Now decode loaded struct (internal *cell.Cell) fields recursively
		return DecodeTLBStructToJSON(inst, tlbs)
	default:
		// Iterate over the fields of the struct (reflect)
		rv := reflect.ValueOf(v)
		if rv.Kind() == reflect.Ptr {
			rv = rv.Elem()
		}
		if !rv.IsValid() {
			return "", nil, fmt.Errorf("failed to decode TLB struct - not valid value: type=%T; val=%v", t, rv)
		}

		if rv.Kind() != reflect.Struct {
			return "", nil, fmt.Errorf("unable to decode as JSON map - not a structure: type=%T; val=%v", t, rv)
		}

		out := make(map[string]interface{}, rv.NumField())
		rt := rv.Type()
		for i := 0; i < rv.NumField(); i++ {
			sf := rt.Field(i)
			// skip unexported fields (e.g. the magic field)
			if sf.PkgPath != "" {
				continue
			}

			// check the json tag to determine the expected key
			k := sf.Name
			jsonTag := sf.Tag.Get("json")
			if jsonTag != "" {
				k = strings.Split(jsonTag, ",")[0] // parse json tag options (key)
			}

			fv := rv.Field(i)
			_, decoded, err := DecodeTLBValToJSON(fv.Interface(), tlbs)
			if err != nil {
				return "", nil, fmt.Errorf("failed to decode TLB value: %w", err)
			}
			out[k] = decoded
		}
		return rt.Name(), out, nil
	}
}

func DecodeTLBValToJSON(v interface{}, tlbs map[uint64]interface{}) (string, interface{}, error) {
	switch t := v.(type) {
	case nil:
		return "<nil>", nil, nil
	case *cell.Cell:
		typeName, decoded, err := DecodeTLBStructToJSON(t, tlbs)
		if err != nil {
			// return "", nil, fmt.Errorf("FAILED: %w", err)
			return "Cell", t, nil // fallback if not a known struct
		}

		return typeName, decoded, nil
	default:
		// for slices/arrays/structs/maps repeat normalization recursively
		rv := reflect.ValueOf(t)
		if !rv.IsValid() {
			return "<invalid>", nil, nil
		}

		switch rv.Kind() {
		case reflect.Slice, reflect.Array:
			if rv.Type().Elem().Kind() == reflect.Uint8 {
				// Early exit for []byte / [N]byte and any alias
				return rv.Type().Name(), t, nil
			}

			out := make([]interface{}, rv.Len())
			for i := 0; i < rv.Len(); i++ {
				_, decoded, err := DecodeTLBValToJSON(rv.Index(i).Interface(), tlbs)
				if err != nil {
					return "", nil, err
				}
				out[i] = decoded
			}
			return rv.Type().String(), out, nil
		case reflect.Map:
			out := map[string]interface{}{}
			for _, k := range rv.MapKeys() {
				keyStr := fmt.Sprint(k.Interface())
				_, decoded, err := DecodeTLBValToJSON(rv.MapIndex(k).Interface(), tlbs)
				if err != nil {
					return "", nil, err
				}
				out[keyStr] = decoded
			}
			return rv.Type().String(), out, nil
		case reflect.Struct:
			// recurse on nested struct
			// create pointer to struct so DecodeTLBStructToJSON can handle exported fields
			ptr := reflect.New(rv.Type()).Interface()
			reflect.ValueOf(ptr).Elem().Set(rv)

			// if there is a json.Marshaler (either on the value or the pointer), prefer it.
			jmType := reflect.TypeOf((*json.Marshaler)(nil)).Elem()
			if rv.CanAddr() && rv.Addr().Type().Implements(jmType) || rv.Type().Implements(jmType) {
				return "", v, nil
			}

			typeName, decoded, err := DecodeTLBStructToJSON(ptr, tlbs)
			if err != nil {
				return "", nil, fmt.Errorf("failed to decode TLB struct: %w; val=%v", err, t)
			}

			return typeName, decoded, nil
		default:
			return rv.Type().Name(), t, nil
		}
	}
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
		// reflect to get the magic number from the struct
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
	if strings.HasPrefix(tag, "#") { //nolint:gocritic // vendored from tonutils-go
		base = 16
		sz = (len(tag) - 1) * 4
	} else if strings.HasPrefix(tag, "$") {
		base = 2
		sz = len(tag) - 1
	} else {
		return 0, fmt.Errorf("unknown magic value type in tag: %s", tag)
	}

	if sz > 64 {
		return 0, fmt.Errorf("too big magic value type in tag") //nolint:perfsprint // vendored from tonutils-go
	}

	magic, err := strconv.ParseInt(tag[1:], base, 64)
	if err != nil {
		return 0, fmt.Errorf("corrupted magic value in tag") //nolint:perfsprint // vendored from tonutils-go
	}

	return uint64(magic), nil //nolint:gosec // vendored from tonutils-go
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
