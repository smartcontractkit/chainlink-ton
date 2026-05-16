package codec

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"github.com/samber/lo"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// MessageMeta keeps the information required to serialize/deserialize TL-B messages.
type MessageMeta struct {
	Contract tvm.FullyQualifiedName
	Opcode   uint64

	// Go runtime type information
	TypeName string
	GoType   reflect.Type
}

func NewMessageMetaFromValue(contract tvm.FullyQualifiedName, v any) (MessageMeta, error) {
	v, err := EnsureTLBStructPointer(v)
	if err != nil {
		return MessageMeta{}, fmt.Errorf("failed to ensure TL-B struct pointer: %w", err)
	}

	typ := reflect.TypeOf(v)
	if typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}

	return NewMessageMeta(contract, typ)
}

// EnsureTLBStructPointer ensures that the provided value is a pointer to a TL-B struct or struct itself.
func EnsureTLBStructPointer(value any) (any, error) {
	if value == nil {
		return nil, nil
	}

	rv := reflect.ValueOf(value)
	if !rv.IsValid() {
		return nil, errors.New("invalid value")
	}

	// Traverse pointer indirections until we reach a struct or a nil pointer.
	for rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return value, nil
		}
		if rv.Elem().Kind() == reflect.Struct {
			return value, nil
		}
		rv = rv.Elem()
		value = rv.Interface()
	}

	if rv.Kind() != reflect.Struct {
		return nil, fmt.Errorf("unsupported TL-B value type %T", value)
	}

	ptr := reflect.New(rv.Type())
	ptr.Elem().Set(rv)
	return ptr.Interface(), nil
}

func NewMessageMeta(contract tvm.FullyQualifiedName, typ reflect.Type) (MessageMeta, error) {
	opcode, err := tvm.ExtractMagic(typ)
	if err != nil {
		return MessageMeta{}, fmt.Errorf("failed to parse opcode for %s: %w", typ, err)
	}

	typeName := typ.Name()
	if typeName == "" {
		typeName = typ.String()
	}

	return MessageMeta{
		Contract: contract,
		TypeName: typeName,
		GoType:   typ,
		Opcode:   opcode,
	}, nil
}

func (m MessageMeta) QualifiedKey() string {
	return fmt.Sprintf("%s:%d", m.Contract, m.Opcode)
}

// messageJSON is the JSON representation of a MessageEnvelope, used in marshaling/unmarshaling.
type messageJSON struct {
	Contract tvm.FullyQualifiedName `json:"contract"`
	Type     string                 `json:"type"`
	Opcode   string                 `json:"opcode"`
	Payload  json.RawMessage        `json:"payload"`
}

// MessageEnvelope is the JSON-friendly representation of a TL-B message.
// The generic type parameter T represents the specific message type being wrapped.
type MessageEnvelope[T any] struct {
	Metadata MessageMeta     `json:"metadata"`
	Payload  json.RawMessage `json:"payload"`
	Cell     *cell.Cell      `json:"-"`
	Value    T               `json:"-"`
}

// WrapMessage prepares a type-safe envelope for the provided TL-B message.
func WrapMessage[T any](contract tvm.FullyQualifiedName, val T) (*MessageEnvelope[T], error) {
	meta, err := NewMessageMetaFromValue(contract, val)
	if err != nil {
		return nil, err
	}

	return &MessageEnvelope[T]{
		Metadata: meta,
		Value:    val,
	}, nil
}

func MustWrapMessage[T any](contract tvm.FullyQualifiedName, val T) *MessageEnvelope[T] {
	env, err := WrapMessage(contract, val)
	if err != nil {
		panic(fmt.Sprintf("failed to wrap message: %v", err))
	}
	return env
}

// MarshalJSON ensures we persist the cached payload bytes when present.
func (e MessageEnvelope[T]) MarshalJSON() ([]byte, error) {
	payload := json.RawMessage("null")
	//nolint:gocritic // allow if-else
	if e.Payload != nil && json.Valid(e.Payload) {
		payload = e.Payload
	} else if !lo.IsNil(e.Value) {
		data, err := json.Marshal(e.Value)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal message value: %w", err)
		}
		payload = json.RawMessage(data)
	} else if e.Payload != nil {
		return nil, errors.New("failed to marshal message payload: invalid JSON payload bytes")
	}

	out := messageJSON{
		Contract: e.Metadata.Contract,
		Type:     e.Metadata.TypeName,
		Opcode:   fmt.Sprintf("0x%08x", e.Metadata.Opcode),
		Payload:  payload,
	}

	return json.Marshal(out)
}

// UnmarshalJSON populates the envelope metadata and rebuilds the typed value.
func (e *MessageEnvelope[T]) UnmarshalJSON(data []byte) error {
	// Try to unmarshal as raw cell first
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) >= 2 && trimmed[0] == '"' && trimmed[len(trimmed)-1] == '"' {
		cellVal := new(cell.Cell)
		if err := cellVal.UnmarshalJSON(trimmed); err == nil {
			e.Cell = cellVal
			e.Payload = nil
			e.Metadata = MessageMeta{}
			return nil
		}
	}

	// Fallback to full JSON envelope
	var raw messageJSON
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("failed to unmarshal message envelope: %w", err)
	}

	payload := raw.Payload
	if payload == nil {
		payload = json.RawMessage("null")
	}

	if !strings.HasPrefix(raw.Opcode, "0x") {
		return fmt.Errorf("invalid opcode format %s: missing 0x prefix", raw.Opcode)
	}

	opcode, err := strconv.ParseUint(raw.Opcode[2:], 16, 64)
	if err != nil {
		return fmt.Errorf("invalid opcode format %s: %w", raw.Opcode, err)
	}
	e.Metadata = MessageMeta{
		Contract: raw.Contract,
		TypeName: raw.Type,
		Opcode:   opcode,
	}
	e.Payload = payload
	e.Cell = nil

	return nil
}

func (e MessageEnvelope[T]) ToCell() (*cell.Cell, error) {
	if !lo.IsNil(e.Value) {
		return tlb.ToCell(e.Value)
	}

	if e.Cell != nil {
		return e.Cell, nil
	}

	return nil, errors.New("no value or cell data to convert to cell")
}

func (e *MessageEnvelope[T]) LoadFromCell(slice *cell.Slice) error {
	if e == nil {
		return errors.New("invalid nil receiver")
	}

	var err error
	e.Cell, err = slice.ToCell()
	return err
}

// LoadFromRegistry attempts to populate the Value T field from the Payload or Cell using the provided registry.
func (e *MessageEnvelope[T]) LoadDecoded(r tvm.ContractTLBRegistry) error {
	val, err := e.decode(r)
	if err != nil {
		return fmt.Errorf("failed to load message from registry: %w", err)
	}

	e.Value = val
	if err = LoadNestedEnvelopes(e.Value, r); err != nil {
		return fmt.Errorf("failed to load nested message envelopes: %w", err)
	}

	e.Metadata.GoType = reflect.TypeOf(val)
	e.Cell, err = tlb.ToCell(val)
	if err != nil {
		return fmt.Errorf("failed to convert loaded message to cell: %w", err)
	}

	return nil
}

// coerceDecodedToType normalizes a decoded value to the envelope type parameter T.
//
// Decoders may return either a value or a single pointer layer, while
// MessageEnvelope[T] can be instantiated with either shape (for example T or *T).
//
// This helper performs a small, deterministic set of conversions:
//  1. Direct type assertion to T.
//  2. One-level pointer dereference and assertion to T.
//
// It returns (zero, false) when the decoded value cannot be safely represented as T.
func coerceDecodedToType[T any](inst any) (T, bool) {
	var zero T

	// 1. Direct assertion to T
	if val, ok := inst.(T); ok {
		return val, true
	}

	// 2. One-level pointer dereference and assertion to T
	decodedVal := reflect.ValueOf(inst)
	if !decodedVal.IsValid() {
		return zero, false
	}

	if decodedVal.Kind() == reflect.Pointer {
		if decodedVal.IsNil() {
			return zero, false
		}

		if val, ok := decodedVal.Elem().Interface().(T); ok {
			return val, true
		}
	}

	return zero, false
}

// decode attempts to decode the message using either the Payload or Cell and the provided registry.
func (e MessageEnvelope[T]) decode(r tvm.ContractTLBRegistry) (T, error) {
	var zero T

	if e.Payload == nil && e.Cell == nil && !lo.IsNil(e.Value) {
		return e.Value, nil
	}

	// TODO (ops): map contract name to opcode (as a fallback) !!
	// Try to load from JSON payload + registry
	if e.Payload != nil {
		typ, ok := r.Lookup(e.Metadata.Contract, e.Metadata.Opcode)
		if !ok {
			return zero, fmt.Errorf("message type not found in registry for contract=%s opcode=0x%08x", e.Metadata.Contract, e.Metadata.Opcode)
		}

		// Create pointer to concrete decode target type (avoid **T when registry stores *T)
		rt := reflect.TypeOf(typ)
		if rt.Kind() == reflect.Pointer {
			rt = rt.Elem()
		}
		inst := reflect.New(rt).Interface()

		if err := json.Unmarshal(e.Payload, inst); err != nil {
			return zero, fmt.Errorf("failed to unmarshal payload into type %s: %w", rt.String(), err)
		}

		val, ok := coerceDecodedToType[T](inst)
		if !ok {
			return zero, fmt.Errorf("decoded value type %T does not match envelope type parameter %T", inst, zero)
		}

		return val, nil
	}

	// Try to load cell + registry
	if e.Cell != nil {
		inst, err := DecodeTLBCellToAny(e.Cell, r.Snapshot())
		if err != nil {
			return zero, fmt.Errorf("failed to decode cell for contract=%s opcode=0x%08x: %w", e.Metadata.Contract, e.Metadata.Opcode, err)
		}

		val, ok := coerceDecodedToType[T](inst)
		if !ok {
			return zero, fmt.Errorf("decoded value type %T does not match envelope type parameter %T", inst, zero)
		}

		return val, nil
	}

	return zero, errors.New("no data available to decode message")
}
