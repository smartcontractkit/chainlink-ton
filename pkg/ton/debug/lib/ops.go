package lib

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"sync"
)

// MessageMeta keeps the information required to serialize/deserialize TL-B messages.
type MessageMeta struct {
	Contract string
	TypeName string
	GoType   reflect.Type
	Opcode   uint64
}

func (m MessageMeta) qualifiedKey() string {
	return fmt.Sprintf("%s:%d", m.Contract, m.Opcode)
}

type messageRegistry struct {
	mu          sync.RWMutex
	byGoType    map[reflect.Type]MessageMeta
	byQualified map[string]MessageMeta
	byOpcode    map[uint64]MessageMeta
}

func newMessageRegistry() *messageRegistry {
	return &messageRegistry{
		byGoType:    make(map[reflect.Type]MessageMeta),
		byQualified: make(map[string]MessageMeta),
		byOpcode:    make(map[uint64]MessageMeta),
	}
}

func (r *messageRegistry) register(contract string, op any) (MessageMeta, error) {
	if op == nil {
		return MessageMeta{}, errors.New("message prototype is nil")
	}

	typ := reflect.TypeOf(op)
	if typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}

	if typ.Kind() != reflect.Struct {
		return MessageMeta{}, fmt.Errorf("message must be a struct, got %s", typ)
	}

	meta, err := buildMetadata(contract, typ)
	if err != nil {
		return MessageMeta{}, err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if existing, ok := r.byGoType[typ]; ok {
		if existing != meta {
			return MessageMeta{}, fmt.Errorf("duplicate registration with conflicting metadata for %s", typ)
		}
		return existing, nil
	}

	r.byGoType[typ] = meta
	r.byQualified[meta.qualifiedKey()] = meta
	r.byOpcode[meta.Opcode] = meta

	return meta, nil
}

func (r *messageRegistry) lookupByValue(op any) (MessageMeta, error) {
	if op == nil {
		return MessageMeta{}, errors.New("message is nil")
	}
	typ := reflect.TypeOf(op)
	if typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	meta, ok := r.byGoType[typ]
	if !ok {
		return MessageMeta{}, fmt.Errorf("unregistered message type %s", typ)
	}
	return meta, nil
}

func (r *messageRegistry) snapshotTLBMap() TLBMap {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make(TLBMap, len(r.byOpcode))
	for opcode, meta := range r.byOpcode {
		out[opcode] = reflect.New(meta.GoType).Elem().Interface()
	}
	return out
}

func (r *messageRegistry) lookup(contract, typeName string, opcodeHex string) (MessageMeta, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if typeName != "" {
		key := fmt.Sprintf("%s:%s", contract, typeName)
		if meta, ok := r.byQualified[key]; ok {
			return meta, nil
		}
	}

	if opcodeHex != "" {
		opcode, err := strconv.ParseUint(opcodeHex[2:], 16, 32)
		if err != nil {
			return MessageMeta{}, fmt.Errorf("invalid opcode format %s: %w", opcodeHex, err)
		}
		meta := MessageMeta{
			Contract: contract,
			TypeName: typeName,
			GoType:   nil,
			Opcode:   opcode,
		}

		if meta, ok := r.byQualified[meta.qualifiedKey()]; ok {
			return meta, nil
		}
	}

	return MessageMeta{}, fmt.Errorf("unable to resolve message metadata for contract=%s type=%s opcode=%s", contract, typeName, opcodeHex)
}

var defaultRegistry = newMessageRegistry()

// RegisterTLBOperations registers all TL-B messages for a contract so that they can be wrapped into MessageEnvelope values.
func RegisterTLBOperations(contract string, tlbMap TLBMap) error {
	for opcode, op := range tlbMap {
		meta, err := defaultRegistry.register(contract, op)
		if err != nil {
			return err
		}
		if meta.Opcode != opcode {
			return fmt.Errorf("opcode mismatch for %s: tag=0x%08x map=0x%08x", meta.TypeName, meta.Opcode, opcode)
		}
	}
	return nil
}

func buildMetadata(contract string, typ reflect.Type) (MessageMeta, error) {
	opcode, err := ExtractMagic(typ)
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

// messageJSON is the JSON representation of a MessageEnvelope, used in marshaling/unmarshaling.
type messageJSON struct {
	Contract string          `json:"contract"`
	Type     string          `json:"type"`
	OpCode   string          `json:"opCode"`
	Payload  json.RawMessage `json:"payload"`
}

// MessageEnvelope is the JSON-friendly representation of a TL-B message.
// The generic type parameter T represents the specific message type being wrapped.
type MessageEnvelope[T any] struct {
	Contract string          `json:"contract"`
	Type     string          `json:"type"`
	OpCode   string          `json:"opCode"`
	Payload  json.RawMessage `json:"payload"`

	Value    T           `json:"-"`
	Metadata MessageMeta `json:"-"`
}

// WrapMessage prepares a type-safe envelope for the provided TL-B message.
func WrapMessage[T any](op T) (MessageEnvelope[T], error) {
	meta, err := defaultRegistry.lookupByValue(op)
	if err != nil {
		return MessageEnvelope[T]{}, err
	}

	payload, err := MarshalWithSurrogates(op)
	if err != nil {
		return MessageEnvelope[T]{}, err
	}

	return MessageEnvelope[T]{
		Contract: meta.Contract,
		Type:     meta.TypeName,
		OpCode:   fmt.Sprintf("0x%08x", meta.Opcode),
		Payload:  json.RawMessage(payload),
		Value:    op,
		Metadata: meta,
	}, nil
}

// MarshalJSON ensures we persist the cached payload bytes when present.
func (e MessageEnvelope[T]) MarshalJSON() ([]byte, error) {
	payload := e.Payload
	if payload == nil {
		var zero T
		if reflect.DeepEqual(e.Value, zero) {
			payload = json.RawMessage("null")
		} else {
			data, err := MarshalWithSurrogates(e.Value)
			if err != nil {
				return nil, err
			}
			payload = json.RawMessage(data)
		}
	}

	out := messageJSON{
		Contract: e.Contract,
		Type:     e.Type,
		OpCode:   e.OpCode,
		Payload:  payload,
	}

	return json.Marshal(out)
}

// UnmarshalJSON populates the envelope metadata and rebuilds the typed value.
func (e *MessageEnvelope[T]) UnmarshalJSON(data []byte) error {
	var raw messageJSON

	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	meta, err := defaultRegistry.lookup(raw.Contract, raw.Type, raw.OpCode)
	if err != nil {
		return err
	}

	payload := raw.Payload
	if payload == nil {
		payload = json.RawMessage("null")
	}

	inst := reflect.New(meta.GoType)
	if err := UnmarshalWithSurrogates(payload, inst.Interface()); err != nil {
		return fmt.Errorf("failed to decode payload for %s: %w", meta.TypeName, err)
	}

	e.Contract = raw.Contract
	e.Type = raw.Type
	e.OpCode = raw.OpCode
	e.Payload = payload

	// Type assertion to T
	value, ok := inst.Interface().(T)
	if !ok {
		// If direct assertion fails, try dereferencing pointer
		if inst.Kind() == reflect.Ptr && inst.Elem().CanInterface() {
			value, ok = inst.Elem().Interface().(T)
		}
		if !ok {
			return fmt.Errorf("decoded value type %T does not match envelope type parameter", inst.Interface())
		}
	}

	e.Value = value
	e.Metadata = meta

	return nil
}

// Decode instantiates a fresh TL-B message based on the registered metadata.
func (e MessageEnvelope[T]) Decode() (T, error) {
	var zero T

	if e.Metadata.GoType == nil {
		meta, err := defaultRegistry.lookup(e.Contract, e.Type, e.OpCode)
		if err != nil {
			return zero, err
		}
		return decodePayload[T](e.Payload, meta)
	}

	return decodePayload[T](e.Payload, e.Metadata)
}

func decodePayload[T any](payload json.RawMessage, meta MessageMeta) (T, error) {
	var zero T

	if payload == nil {
		payload = json.RawMessage("null")
	}

	inst := reflect.New(meta.GoType)
	if err := UnmarshalWithSurrogates(payload, inst.Interface()); err != nil {
		return zero, fmt.Errorf("failed to decode payload for %s: %w", meta.TypeName, err)
	}

	// Type assertion to T
	value, ok := inst.Interface().(T)
	if !ok {
		// If direct assertion fails, try dereferencing pointer
		if inst.Kind() == reflect.Ptr && inst.Elem().CanInterface() {
			value, ok = inst.Elem().Interface().(T)
		}
		if !ok {
			return zero, fmt.Errorf("decoded value type %T does not match expected type", inst.Interface())
		}
	}

	return value, nil
}
