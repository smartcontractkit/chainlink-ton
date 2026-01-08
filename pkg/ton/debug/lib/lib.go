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

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// TLBMap is a map of opcodes to their corresponding TL-B types.
type TLBMap map[uint64]any

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
	ContractType() string
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
func NewMessageInfoFromCell(t string, msg *cell.Cell, tlbs TLBMap, tlbsCtx TLBMap) (MessageInfo, error) {
	typeName, norm, err := DecodeTLBValToJSON(msg, tlbs)
	if err != nil {
		return nil, fmt.Errorf("failed to decode message for contract %s: %w", t, err)
	}

	if typeName == "Cell" { // on decoder fallback (not decoded)
		return nil, &UnknownMessageError{}
	}

	// Second round of decoding - internal payloads using TLBs from loaded context
	_, norm, err = DecodeTLBValToJSON(norm, tlbsCtx)
	if err != nil {
		return nil, fmt.Errorf("failed to decode message for contract %s: %w", t, err)
	}

	name := fmt.Sprintf("%s:%s", t, typeName)
	// Marshal the final normalized map[string]any as JSON string
	return NewMessageInfo(name, norm)
}

func DecodeTLBCellToAny(c *cell.Cell, tlbs TLBMap) (any, error) {
	if c == nil {
		return nil, errors.New("can't decode nil as cell")
	}

	// Try to decode *cell.Cell as one of the TLBs type by reading the opcode
	r := c.BeginParse()
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

	// Create new instance of the candidate type
	rt := reflect.TypeOf(i)
	inst := reflect.New(rt).Interface() // pointer to zero value

	// Attempt decode - replace tlb.FromCell with the actual decode API you have
	if err = tlb.LoadFromCell(inst, r); err != nil {
		return nil, fmt.Errorf("failed to decode message for opcode 0x%X: %w", opCode, err)
	}

	return inst, nil
}

func DecodeTLBStructToJSON(v any, tlbs TLBMap) (string, map[string]any, error) {
	// Checks if a value is nil or if it's a reference type with a nil underlying value.
	if IsNil(v) {
		return "", nil, errors.New("can't decode nil as struct")
	}

	switch t := v.(type) {
	case *cell.Cell:
		inst, err := DecodeTLBCellToAny(t, tlbs)
		if err != nil {
			return "", nil, fmt.Errorf("failed to decode cell to struct type (any): %w", err)
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

		out := make(map[string]any, rv.NumField())
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

func DecodeTLBValToJSON(v any, tlbs TLBMap) (string, any, error) {
	// Checks if a value is nil or if it's a reference type with a nil underlying value.
	if IsNil(v) {
		return "<nil>", v, nil
	}

	switch t := v.(type) {
	case *cell.Cell:
		typeName, decoded, err := DecodeTLBStructToJSON(t, tlbs)
		if err != nil {
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

			out := make([]any, rv.Len())
			for i := 0; i < rv.Len(); i++ {
				_, decoded, err := DecodeTLBValToJSON(rv.Index(i).Interface(), tlbs)
				if err != nil {
					return "", nil, err
				}
				out[i] = decoded
			}
			return rv.Type().String(), out, nil
		case reflect.Map:
			out := map[string]any{}
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

// Returns ordered keys based TL-B annotated struct type
func DecodeTLBStructKeys(v any, tlbs TLBMap) ([]string, error) {
	// Checks if a value is nil or if it's a reference type with a nil underlying value.
	if IsNil(v) {
		return nil, errors.New("can't decode nil as struct")
	}

	switch t := v.(type) {
	case *cell.Cell:
		inst, err := DecodeTLBCellToAny(t, tlbs)
		if err != nil {
			return nil, fmt.Errorf("failed to decode cell to struct type (any): %w", err)
		}

		// Now decode loaded struct (internal *cell.Cell) fields recursively
		return DecodeTLBStructKeys(inst, tlbs)
	default:
		// Iterate over the fields of the struct (reflect)
		rv := reflect.ValueOf(v)
		if rv.Kind() == reflect.Ptr {
			rv = rv.Elem()
		}
		if !rv.IsValid() {
			return nil, fmt.Errorf("failed to decode TLB struct - not valid value: type=%T; val=%v", t, rv)
		}

		if rv.Kind() != reflect.Struct {
			return nil, fmt.Errorf("unable to decode as JSON map - not a structure: type=%T; val=%v", t, rv)
		}

		out := []string{}
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

			if k == "" {
				continue
			}

			out = append(out, k)
		}
		return out, nil
	}
}

// IsNil checks if a value is nil or if it's a reference type with a nil underlying value.
// Notice: vendoring github:samber/lo
func IsNil(x any) bool {
	if x == nil {
		return true
	}
	v := reflect.ValueOf(x)
	switch v.Kind() {
	case reflect.Chan, reflect.Func, reflect.Map, reflect.Pointer, reflect.UnsafePointer, reflect.Interface, reflect.Slice:
		return v.IsNil()
	default:
		return false
	}
}

func MustNewTLBMap(types []any) TLBMap {
	tlbs, err := NewTLBMap(types)
	if err != nil {
		panic(fmt.Errorf("failed to create TLB map: %w", err))
	}
	return tlbs
}

// NewTLBMap creates a map of TL-B magic numbers (opcodes) to their corresponding types
// from a set of TL-B annotated struct instances.
func NewTLBMap(types []any) (TLBMap, error) {
	tlbs := make(TLBMap)
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

// Notice: vendoring github:xssnick/tonutils-go tlb package
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
