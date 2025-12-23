package codec

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// MessageMeta keeps the information required to serialize/deserialize TL-B messages.
type MessageMeta struct {
	Contract string
	Opcode   uint64

	// Go runtime type information
	TypeName string
	GoType   reflect.Type
}

func NewMessageMetaFromValue(contract string, v any) (MessageMeta, error) {
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

func NewMessageMeta(contract string, typ reflect.Type) (MessageMeta, error) {
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
	Contract string          `json:"contract"`
	Type     string          `json:"type"`
	Opcode   string          `json:"opcode"`
	Payload  json.RawMessage `json:"payload"`
}

// MessageEnvelope is the JSON-friendly representation of a TL-B message.
// The generic type parameter T represents the specific message type being wrapped.
type MessageEnvelope[T any] struct {
	Metadata MessageMeta     `json:"metadata"`
	Payload  json.RawMessage `json:"payload"`
	Cell     *cell.Cell      `json:"-"`
	Value    *T              `json:"-"`
}

// WrapMessage prepares a type-safe envelope for the provided TL-B message.
func WrapMessage[T any](contract string, op T) (MessageEnvelope[T], error) {
	meta, err := NewMessageMetaFromValue(contract, op)
	if err != nil {
		return MessageEnvelope[T]{}, err
	}

	return MessageEnvelope[T]{
		Metadata: meta,
		Value:    &op,
	}, nil
}

// MarshalJSON ensures we persist the cached payload bytes when present.
func (e MessageEnvelope[T]) MarshalJSON() ([]byte, error) {
	payload := e.Payload
	if payload == nil {
		var zero T
		if e.Value == nil || reflect.DeepEqual(e.Value, zero) {
			payload = json.RawMessage("null")
		} else {
			data, err := json.Marshal(e.Value)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal message value: %w", err)
			}
			payload = json.RawMessage(data)
		}
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

	return nil
}

func (e MessageEnvelope[T]) ToCell() (*cell.Cell, error) {
	if e.Cell != nil {
		return e.Cell, nil
	}

	if e.Value == nil {
		return nil, errors.New("cannot convert to cell: no value present")
	}

	return tlb.ToCell(*(e.Value))
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
func (e *MessageEnvelope[T]) LoadDecoded(r tvm.MessageRegistry) error {
	val, err := e.Decode(r)
	if err != nil {
		return fmt.Errorf("failed to load message from registry: %w", err)
	}

	e.Value = &val
	return nil
}

type envelopeLoader interface {
	LoadDecoded(tvm.MessageRegistry) error
}

var envelopeLoaderType = reflect.TypeOf((*envelopeLoader)(nil)).Elem()

// Decode attempts to decode the message recursively using either the Payload or Cell and the provided registry.
func (e MessageEnvelope[T]) Decode(r tvm.MessageRegistry) (T, error) {
	decoded, err := e.decode(r)
	if err != nil {
		var zero T
		return zero, fmt.Errorf("failed to decode message: %w", err)
	}

	value := reflect.ValueOf(decoded)
	if !value.IsValid() {
		return decoded, nil
	}

	var structVal reflect.Value
	switch value.Kind() {
	case reflect.Pointer:
		if value.IsNil() {
			return decoded, nil
		}
		if value.Elem().Kind() != reflect.Struct {
			return decoded, nil
		}
		structVal = value.Elem()
	case reflect.Struct:
		structVal = value
	default:
		return decoded, nil
	}

	for i := 0; i < structVal.NumField(); i++ {
		fieldVal := structVal.Field(i)
		fieldType := structVal.Type().Field(i)

		var loader envelopeLoader
		// Handle pointer fields
		if fieldVal.Kind() == reflect.Pointer {
			if fieldVal.IsNil() {
				continue
			}
			if fieldVal.Type().Implements(envelopeLoaderType) && fieldVal.CanInterface() {
				loader = fieldVal.Interface().(envelopeLoader)
			}
		}

		// Handle non-pointer fields
		if loader == nil && fieldVal.CanAddr() {
			addr := fieldVal.Addr()
			if addr.Type().Implements(envelopeLoaderType) && addr.CanInterface() {
				loader = addr.Interface().(envelopeLoader)
			}
		}

		if loader == nil {
			continue
		}

		if err := loader.LoadDecoded(r); err != nil {
			return decoded, fmt.Errorf("failed to decode nested envelope field %s: %w", fieldType.Name, err)
		}
	}

	return decoded, nil
}

// decode attempts to decode the message using either the Payload or Cell and the provided registry.
func (e MessageEnvelope[T]) decode(r tvm.MessageRegistry) (T, error) {
	// Check if already loaded
	if e.Value != nil {
		return *e.Value, nil
	}

	var zero T

	// Try to load from JSON payload + registry
	if e.Payload != nil {
		typ, ok := r.Lookup(e.Metadata.Contract, e.Metadata.Opcode)
		if !ok {
			return zero, fmt.Errorf("message type not found in registry for contract=%s opcode=0x%08x", e.Metadata.Contract, e.Metadata.Opcode)
		}

		// Create new instance of the candidate type
		rt := reflect.TypeOf(typ)
		inst := reflect.New(rt).Interface() // pointer to zero value

		if err := json.Unmarshal(e.Payload, inst); err != nil {
			return zero, fmt.Errorf("failed to unmarshal payload into type %s: %w", rt.String(), err)
		}

		val, ok := inst.(T)
		if !ok {
			return zero, fmt.Errorf("decoded value type %T does not match envelope type parameter", inst)
		}

		return val, nil
	}

	// Try to load cell + registry
	if e.Cell != nil {
		inst, err := DecodeTLBCellToAny(e.Cell, r.Snapshot())
		if err != nil {
			return zero, fmt.Errorf("failed to decode cell for contract=%s opcode=0x%08x: %w", e.Metadata.Contract, e.Metadata.Opcode, err)
		}

		val, ok := inst.(T)
		if !ok {
			return zero, fmt.Errorf("decoded value type %T does not match envelope type parameter", inst)
		}

		return val, nil
	}

	return zero, fmt.Errorf("no data available to decode message")
}
