package lib

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"

	"github.com/samber/lo"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/jsoncodec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// MessageRegistry is a registry of TL-B types for decoding messages and events.
//
// It maps contract types (string) to their corresponding TLBMap.
type MessageRegistry map[string]TLBMap

// SnapshotTLBMap creates a combined TLBMap from all registered contract types.
// This is useful for decoding messages when the contract type is not known in advance.
// Duplicate opcodes will be overwritten by the last occurrence, order is not guaranteed.
func (r MessageRegistry) Snapshot() TLBMap {
	combined := make(TLBMap)
	for _, tlbMap := range r {
		for opcode, typ := range tlbMap {
			combined[opcode] = typ
		}
	}
	return combined
}

// Lookup retrieves the TL-B type for the given contract and opcode.
func (r MessageRegistry) Lookup(contract string, opcode uint32) (any, bool) {
	tlbs, ok := r[contract]
	if !ok {
		return nil, false
	}

	typ, ok := tlbs[opcode]
	return typ, ok
}

// LookupByOpcode retrieves the TL-B type for the given opcode across all registered contracts (snapshot).
func (r MessageRegistry) LookupByOpcode(opcode uint32) (any, bool) {
	for _, tlbMap := range r {
		if typ, ok := tlbMap[opcode]; ok {
			return typ, true
		}
	}
	return nil, false
}

// TLBMap is a map of opcodes to their corresponding TL-B types.
type TLBMap map[uint32]any

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
	opcode, err := r.PreloadUInt(32)
	if err != nil {
		return nil, fmt.Errorf("failed to preload opcode: %w", err)
	}

	i, ok := tlbs[uint32(opcode)]
	if !ok {
		return nil, &UnknownMessageError{}
	}

	// Create new instance of the candidate type
	rt := reflect.TypeOf(i)
	inst := reflect.New(rt).Interface() // pointer to zero value

	// Attempt decode - replace tlb.FromCell with the actual decode API you have
	if err = tlb.LoadFromCell(inst, r); err != nil {
		return nil, fmt.Errorf("failed to decode message for opcode 0x%X: %w", opcode, err)
	}

	return inst, nil
}

func DecodeTLBStructToJSON(v any, tlbs TLBMap) (string, map[string]any, error) {
	if lo.IsNil(v) {
		return "", nil, errors.New("can't decode nil as struct")
	}

	typeName, decoded, err := DecodeTLBValToJSON(v, tlbs)
	if err != nil {
		return "", nil, err
	}

	if decoded == nil {
		return typeName, nil, nil
	}

	object, ok := decoded.(map[string]any)
	if !ok {
		return "", nil, fmt.Errorf("decoded value for %s is not an object (type %T)", typeName, decoded)
	}

	return typeName, object, nil
}

func DecodeTLBValToJSON(v any, tlbs TLBMap) (string, any, error) {
	restored, err := restoreCells(v)
	if err != nil {
		return "", nil, err
	}
	v = restored

	if lo.IsNil(v) {
		return "<nil>", v, nil
	}

	if cellVal, ok := v.(*cell.Cell); ok {
		inst, err := DecodeTLBCellToAny(cellVal, tlbs)
		if err != nil {
			var unknown *UnknownMessageError
			if errors.As(err, &unknown) {
				return "Cell", cellVal, nil
			}
			return "", nil, err
		}
		return DecodeTLBValToJSON(inst, tlbs)
	}

	codec := jsoncodec.NewCodec(jsoncodec.WithCellPresenter(func(c *cell.Cell) (jsoncodec.CellPresentation, error) {
		inst, err := DecodeTLBCellToAny(c, tlbs)
		if err != nil {
			var unknown *UnknownMessageError
			if errors.As(err, &unknown) {
				return jsoncodec.CellPresentation{}, nil
			}
			return jsoncodec.CellPresentation{}, nil
		}

		typeName, decoded, err := DecodeTLBValToJSON(inst, tlbs)
		if err != nil {
			return jsoncodec.CellPresentation{}, err
		}

		return jsoncodec.CellPresentation{
			Type:       typeName,
			Value:      decoded,
			Normalized: true,
		}, nil
	}))

	normalized, err := codec.Normalize(v)
	if err != nil {
		return "", nil, err
	}

	return describeType(v), prepareReturnValue(normalized), nil
}

func restoreCells(v any) (any, error) {
	switch typed := v.(type) {
	case cellWrapper:
		cellVal, err := typed.toCell()
		if err != nil {
			return nil, err
		}
		return cellVal, nil
	case map[string]any:
		for key, val := range typed {
			restored, err := restoreCells(val)
			if err != nil {
				return nil, err
			}
			typed[key] = restored
		}
		return typed, nil
	case []any:
		for i := range typed {
			restored, err := restoreCells(typed[i])
			if err != nil {
				return nil, err
			}
			typed[i] = restored
		}
		return typed, nil
	default:
		return v, nil
	}
}

func prepareReturnValue(v any) any {
	switch typed := v.(type) {
	case map[string]any:
		if wrapper, ok := convertCellMapToWrapper(typed); ok {
			return wrapper
		}
		for key, val := range typed {
			typed[key] = prepareReturnValue(val)
		}
		return typed
	case []any:
		for i := range typed {
			typed[i] = prepareReturnValue(typed[i])
		}
		if len(typed) == 0 {
			return nil
		}
		return typed
	default:
		return prepareStructValue(v)
	}
}

func convertCellMapToWrapper(m map[string]any) (cellWrapper, bool) {
	boc, hasBOC := m["boc"].(string)
	if !hasBOC {
		return cellWrapper{}, false
	}

	wrapper := cellWrapper{boc: boc}
	if decoded, ok := m["decoded"]; ok && decoded != nil {
		wrapper.decoded = prepareReturnValue(decoded)
	}
	return wrapper, true
}

func prepareStructValue(v any) any {
	if v == nil {
		return nil
	}

	rv := reflect.ValueOf(v)
	if rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return nil
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return v
	}

	tp := rv.Type()
	if _, ok := tp.FieldByName("KeySize"); ok {
		return v
	}
	bocField := rv.FieldByName("BOC")
	if !bocField.IsValid() || bocField.Kind() != reflect.String {
		return v
	}

	wrapper := cellWrapper{boc: bocField.String()}
	decodedField := rv.FieldByName("Decoded")
	if decodedField.IsValid() && decodedField.CanInterface() && !decodedField.IsZero() {
		wrapper.decoded = prepareReturnValue(decodedField.Interface())
	}

	return wrapper
}

func describeType(v any) string {
	if v == nil {
		return "<nil>"
	}
	rt := reflect.TypeOf(v)
	if rt.Kind() == reflect.Pointer {
		rt = rt.Elem()
	}
	if name := rt.Name(); name != "" {
		return name
	}
	return rt.String()
}

// Returns ordered keys based TL-B annotated struct type
func DecodeTLBStructKeys(v any, tlbs TLBMap) ([]string, error) {
	// Checks if a value is nil or if it's a reference type with a nil underlying value.
	if lo.IsNil(v) {
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
		magic, err := ExtractMagicFromValue(typ)
		if err != nil {
			return nil, fmt.Errorf("failed to extract magic from type %T: %w", typ, err)
		}

		tlbs[magic] = typ
	}
	return tlbs, nil
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

type cellWrapper struct {
	boc     string
	decoded any
}

func (w cellWrapper) MarshalJSON() ([]byte, error) {
	if w.decoded != nil {
		return json.Marshal(w.decoded)
	}
	return json.Marshal(w.boc)
}

func (w cellWrapper) toCell() (*cell.Cell, error) {
	raw, err := base64.StdEncoding.DecodeString(w.boc)
	if err != nil {
		return nil, fmt.Errorf("failed to decode cell boc: %w", err)
	}

	root, err := cell.FromBOC(raw)
	if err != nil {
		return nil, fmt.Errorf("failed to rebuild cell from boc: %w", err)
	}

	return root, nil
}
