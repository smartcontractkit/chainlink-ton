package jsoncodec

import (
	"bytes"
	"encoding"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Option func(*options)

type options struct {
	cellPresenter CellPresenter
}

type Codec struct {
	opts options
}

type CellPresentation struct {
	Type       string
	Value      any
	Normalized bool
}

type CellPresenter func(*cell.Cell) (CellPresentation, error)

func NewCodec(opts ...Option) *Codec {
	c := &Codec{}
	for _, opt := range opts {
		opt(&c.opts)
	}
	return c
}

func WithCellPresenter(p CellPresenter) Option {
	return func(o *options) {
		o.cellPresenter = p
	}
}

func (c *Codec) Marshal(value any) (json.RawMessage, error) {
	normalized, err := c.Normalize(value)
	if err != nil {
		return nil, err
	}

	data, err := json.Marshal(normalized)
	if err != nil {
		return nil, err
	}

	return json.RawMessage(data), nil
}

func (c *Codec) Unmarshal(payload json.RawMessage, target any) error {
	if target == nil {
		return errors.New("target is nil")
	}

	val := reflect.ValueOf(target)
	if val.Kind() != reflect.Pointer || val.IsNil() {
		return errors.New("target must be a non-nil pointer")
	}

	blob := payload
	if len(bytes.TrimSpace(blob)) == 0 {
		blob = json.RawMessage("null")
	}

	dec := json.NewDecoder(bytes.NewReader(blob))
	dec.UseNumber()
	var generic any
	if err := dec.Decode(&generic); err != nil {
		return err
	}

	return c.assign(val.Elem(), generic)
}

func (c *Codec) Normalize(value any) (any, error) {
	if value == nil {
		return nil, nil
	}
	return c.normalizeValue(reflect.ValueOf(value))
}

var (
	jsonMarshalerType   = reflect.TypeOf((*json.Marshaler)(nil)).Elem()
	jsonUnmarshalerType = reflect.TypeOf((*json.Unmarshaler)(nil)).Elem()
	textMarshalerType   = reflect.TypeOf((*encoding.TextMarshaler)(nil)).Elem()
	dictPtrType         = reflect.TypeOf((*cell.Dictionary)(nil))
	cellPtrType         = reflect.TypeOf((*cell.Cell)(nil))
)

func (c *Codec) normalizeValue(val reflect.Value) (any, error) {
	val = unwrapInterface(val)
	if !val.IsValid() {
		return nil, nil
	}

	if val.Kind() == reflect.Pointer {
		if val.IsNil() {
			return nil, nil
		}

		if payload, ok, err := c.encodePointer(val); ok || err != nil {
			return payload, err
		}
		return c.normalizeValue(val.Elem())
	}

	if payload, ok, err := encodeViaTextMarshaler(val); ok || err != nil {
		return payload, err
	}

	if payload, ok, err := encodeViaJSONMarshaler(val); ok || err != nil {
		return payload, err
	}

	switch val.Kind() {
	case reflect.Struct:
		return c.normalizeStruct(val)
	case reflect.Slice:
		if val.Type().Elem().Kind() == reflect.Uint8 {
			return val.Interface(), nil
		}
		fallthrough
	case reflect.Array:
		return c.normalizeArray(val)
	case reflect.Map:
		return c.normalizeMap(val)
	default:
		return val.Interface(), nil
	}
}

func (c *Codec) encodePointer(val reflect.Value) (any, bool, error) {
	switch val.Type() {
	case dictPtrType:
		return encodeDictionary(val.Interface().(*cell.Dictionary))
	case cellPtrType:
		payload, err := c.encodeCell(val.Interface().(*cell.Cell))
		return payload, true, err
	default:
		return nil, false, nil
	}
}

func (c *Codec) encodeCell(src *cell.Cell) (cellJSON, error) {
	if src == nil {
		return cellJSON{}, nil
	}

	payload := cellJSON{BOC: base64.StdEncoding.EncodeToString(src.ToBOC())}
	if c.opts.cellPresenter == nil {
		return payload, nil
	}

	presentation, err := c.opts.cellPresenter(src)
	if err != nil {
		return cellJSON{}, err
	}

	if presentation.Type == "" && presentation.Value == nil {
		return payload, nil
	}

	payload.Type = presentation.Type
	if presentation.Value == nil {
		return payload, nil
	}

	if presentation.Normalized {
		payload.Decoded = presentation.Value
		return payload, nil
	}

	decoded, err := c.Normalize(presentation.Value)
	if err != nil {
		return cellJSON{}, err
	}
	payload.Decoded = decoded
	return payload, nil
}

func (c *Codec) normalizeStruct(val reflect.Value) (map[string]any, error) {
	out := make(map[string]any, val.NumField())
	typ := val.Type()

	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i)
		if !field.IsExported() {
			continue
		}

		name, opts := parseJSONTag(field.Tag.Get("json"), field.Name)
		if name == "" {
			continue
		}

		fieldVal := val.Field(i)
		if opts.omitempty && isZero(fieldVal) {
			continue
		}

		item, err := c.normalizeValue(fieldVal)
		if err != nil {
			return nil, err
		}

		out[name] = item
	}

	return out, nil
}

func (c *Codec) normalizeArray(val reflect.Value) (any, error) {
	out := make([]any, val.Len())
	for i := 0; i < val.Len(); i++ {
		item, err := c.normalizeValue(val.Index(i))
		if err != nil {
			return nil, err
		}
		out[i] = item
	}
	return out, nil
}

func (c *Codec) normalizeMap(val reflect.Value) (any, error) {
	if val.IsNil() {
		return nil, nil
	}

	out := make(map[string]any, val.Len())
	iter := val.MapRange()
	for iter.Next() {
		key := fmt.Sprint(iter.Key().Interface())
		item, err := c.normalizeValue(iter.Value())
		if err != nil {
			return nil, err
		}
		out[key] = item
	}
	return out, nil
}

func (c *Codec) assign(target reflect.Value, data any) error {
	if !target.CanSet() {
		return errors.New("target not settable")
	}

	switch target.Kind() {
	case reflect.Interface:
		if data == nil {
			target.SetZero()
			return nil
		}
		target.Set(reflect.ValueOf(data))
		return nil
	case reflect.Pointer:
		if data == nil {
			target.SetZero()
			return nil
		}

		switch target.Type() {
		case dictPtrType:
			if target.IsNil() {
				target.Set(reflect.New(target.Type().Elem()))
			}
			return decodeDictionary(target, data)
		case cellPtrType:
			return decodeCell(target, data)
		default:
			if target.IsNil() {
				target.Set(reflect.New(target.Type().Elem()))
			}
			return c.assign(target.Elem(), data)
		}
	}

	if supportsJSONUnmarshal(target) {
		return decodeThroughJSON(target, data)
	}

	switch target.Kind() {
	case reflect.Struct:
		return c.assignStruct(target, data)
	case reflect.Slice:
		return c.assignSlice(target, data)
	case reflect.Array:
		return c.assignArray(target, data)
	case reflect.Map:
		return c.assignMap(target, data)
	default:
		return decodeThroughJSON(target, data)
	}
}

func (c *Codec) assignStruct(target reflect.Value, data any) error {
	object, ok := data.(map[string]any)
	if !ok {
		if data == nil {
			target.SetZero()
			return nil
		}
		return fmt.Errorf("expected JSON object for %s", target.Type())
	}

	typ := target.Type()
	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i)
		if !field.IsExported() {
			continue
		}

		name, _ := parseJSONTag(field.Tag.Get("json"), field.Name)
		if name == "" {
			continue
		}

		raw, ok := object[name]
		if !ok {
			target.Field(i).SetZero()
			continue
		}

		if err := c.assign(target.Field(i), raw); err != nil {
			return fmt.Errorf("field %s: %w", field.Name, err)
		}
	}

	return nil
}

func (c *Codec) assignSlice(target reflect.Value, data any) error {
	if target.Type().Elem().Kind() == reflect.Uint8 {
		return decodeThroughJSON(target, data)
	}

	if data == nil {
		target.SetZero()
		return nil
	}

	arr, ok := data.([]any)
	if !ok {
		return fmt.Errorf("expected JSON array for %s", target.Type())
	}

	slice := reflect.MakeSlice(target.Type(), len(arr), len(arr))
	for i := range arr {
		if err := c.assign(slice.Index(i), arr[i]); err != nil {
			return err
		}
	}

	target.Set(slice)
	return nil
}

func (c *Codec) assignArray(target reflect.Value, data any) error {
	arr, ok := data.([]any)
	if !ok {
		return fmt.Errorf("expected JSON array for %s", target.Type())
	}

	for i := 0; i < target.Len() && i < len(arr); i++ {
		if err := c.assign(target.Index(i), arr[i]); err != nil {
			return err
		}
	}
	return nil
}

func (c *Codec) assignMap(target reflect.Value, data any) error {
	if data == nil {
		target.SetZero()
		return nil
	}

	entries, ok := data.(map[string]any)
	if !ok {
		return fmt.Errorf("expected JSON object for %s", target.Type())
	}

	result := reflect.MakeMapWithSize(target.Type(), len(entries))
	for key, raw := range entries {
		mapKey := reflect.New(target.Type().Key()).Elem()
		if err := assignMapKey(mapKey, key); err != nil {
			return err
		}

		mapValue := reflect.New(target.Type().Elem()).Elem()
		if err := c.assign(mapValue, raw); err != nil {
			return err
		}

		result.SetMapIndex(mapKey, mapValue)
	}

	target.Set(result)
	return nil
}

func unwrapInterface(val reflect.Value) reflect.Value {
	for val.Kind() == reflect.Interface && !val.IsNil() {
		val = val.Elem()
	}
	return val
}

func selectJSONMarshaler(val reflect.Value) (any, bool) {
	typ := val.Type()
	if typ.Implements(jsonMarshalerType) {
		return val.Interface(), true
	}
	if val.CanAddr() {
		addr := val.Addr()
		if addr.Type().Implements(jsonMarshalerType) {
			return addr.Interface(), true
		}
	}
	if typ.Kind() != reflect.Pointer && reflect.PointerTo(typ).Implements(jsonMarshalerType) {
		clone := reflect.New(typ)
		clone.Elem().Set(val)
		return clone.Interface(), true
	}
	return nil, false
}

func selectTextMarshaler(val reflect.Value) encoding.TextMarshaler {
	typ := val.Type()
	if typ.Implements(textMarshalerType) {
		if marshaler, ok := val.Interface().(encoding.TextMarshaler); ok {
			return marshaler
		}
	}
	if val.CanAddr() {
		addr := val.Addr()
		if addr.Type().Implements(textMarshalerType) {
			if marshaler, ok := addr.Interface().(encoding.TextMarshaler); ok {
				return marshaler
			}
		}
	}
	if typ.Kind() != reflect.Pointer && reflect.PointerTo(typ).Implements(textMarshalerType) {
		clone := reflect.New(typ)
		clone.Elem().Set(val)
		if marshaler, ok := clone.Interface().(encoding.TextMarshaler); ok {
			return marshaler
		}
	}
	return nil
}

func supportsJSONUnmarshal(val reflect.Value) bool {
	typ := val.Type()
	if typ.Implements(jsonUnmarshalerType) {
		return true
	}
	if val.CanAddr() && val.Addr().Type().Implements(jsonUnmarshalerType) {
		return true
	}
	if typ.Kind() != reflect.Pointer && reflect.PointerTo(typ).Implements(jsonUnmarshalerType) {
		return true
	}
	return false
}

func encodeViaJSONMarshaler(val reflect.Value) (any, bool, error) {
	marshaler, ok := selectJSONMarshaler(val)
	if !ok {
		return nil, false, nil
	}

	data, err := json.Marshal(marshaler)
	if err != nil {
		return nil, true, err
	}

	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var generic any
	if err := dec.Decode(&generic); err != nil {
		return nil, true, err
	}

	return generic, true, nil
}

func encodeViaTextMarshaler(val reflect.Value) (any, bool, error) {
	marshaler := selectTextMarshaler(val)
	if marshaler == nil {
		return nil, false, nil
	}

	text, err := marshaler.MarshalText()
	if err != nil {
		return nil, true, err
	}

	if isJSONIntegerLiteral(text) {
		return json.Number(text), true, nil
	}

	return string(text), true, nil
}

func isJSONIntegerLiteral(data []byte) bool {
	if len(data) == 0 {
		return false
	}

	for i, b := range data {
		if b >= '0' && b <= '9' {
			continue
		}
		if i == 0 && b == '-' && len(data) > 1 {
			continue
		}
		return false
	}

	return true
}

func decodeThroughJSON(target reflect.Value, data any) error {
	if data == nil {
		target.SetZero()
		return nil
	}

	buf, err := json.Marshal(data)
	if err != nil {
		return err
	}

	ptr := reflect.New(target.Type())
	if err := json.Unmarshal(buf, ptr.Interface()); err != nil {
		return err
	}

	target.Set(ptr.Elem())
	return nil
}

type dictionaryJSON struct {
	KeySize uint   `json:"keySize"`
	BOC     string `json:"boc"`
}

type cellJSON struct {
	Type    string `json:"type,omitempty"`
	Decoded any    `json:"decoded,omitempty"`
	BOC     string `json:"boc"`
}

func encodeDictionary(dict *cell.Dictionary) (any, bool, error) {
	if dict == nil {
		return dictionaryJSON{}, true, nil
	}

	root := dict.AsCell()
	if root == nil {
		return nil, true, errors.New("dictionary has nil root cell")
	}

	return dictionaryJSON{
		KeySize: dict.GetKeySize(),
		BOC:     base64.StdEncoding.EncodeToString(root.ToBOC()),
	}, true, nil
}

func decodeDictionary(target reflect.Value, data any) error {
	if data == nil {
		target.SetZero()
		return nil
	}

	object, ok := data.(map[string]any)
	if !ok {
		return errors.New("invalid dictionary payload")
	}

	size, err := asUint(object["keySize"])
	if err != nil {
		return fmt.Errorf("invalid dictionary keySize: %w", err)
	}

	boc, ok := object["boc"].(string)
	if !ok {
		return errors.New("dictionary boc must be a string")
	}

	raw, err := base64.StdEncoding.DecodeString(boc)
	if err != nil {
		return fmt.Errorf("failed to decode dictionary boc: %w", err)
	}

	root, err := cell.FromBOC(raw)
	if err != nil {
		return fmt.Errorf("failed to rebuild dictionary cell: %w", err)
	}

	dict := root.AsDict(size)
	if dict == nil {
		return errors.New("failed to convert cell to dictionary")
	}

	target.Set(reflect.ValueOf(dict))
	return nil
}

func decodeCell(target reflect.Value, data any) error {
	if data == nil {
		target.SetZero()
		return nil
	}

	switch typed := data.(type) {
	case string:
		return setCellFromBOC(target, typed)
	case map[string]any:
		boc, ok := typed["boc"].(string)
		if !ok {
			return errors.New("cell surrogate missing boc")
		}
		return setCellFromBOC(target, boc)
	default:
		return fmt.Errorf("invalid cell payload (type %T)", data)
	}
}

func setCellFromBOC(target reflect.Value, encoded string) error {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return fmt.Errorf("failed to decode cell boc: %w", err)
	}

	cellValue, err := cell.FromBOC(raw)
	if err != nil {
		return fmt.Errorf("failed to rebuild cell: %w", err)
	}

	target.Set(reflect.ValueOf(cellValue))
	return nil
}

func asUint(value any) (uint, error) {
	switch v := value.(type) {
	case json.Number:
		i, err := v.Int64()
		if err != nil {
			return 0, err
		}
		if i < 0 {
			return 0, errors.New("negative value")
		}
		return uint(i), nil
	case float64:
		if v < 0 {
			return 0, errors.New("negative value")
		}
		return uint(v), nil
	case float32:
		if v < 0 {
			return 0, errors.New("negative value")
		}
		return uint(v), nil
	case int, int8, int16, int32, int64:
		i := reflect.ValueOf(v).Int()
		if i < 0 {
			return 0, errors.New("negative value")
		}
		return uint(i), nil
	case uint, uint8, uint16, uint32, uint64, uintptr:
		return uint(reflect.ValueOf(v).Uint()), nil
	default:
		return 0, fmt.Errorf("unsupported type %T", value)
	}
}

type jsonTagOptions struct {
	omitempty bool
}

func parseJSONTag(tag, field string) (string, jsonTagOptions) {
	if tag == "-" {
		return "", jsonTagOptions{}
	}
	if tag == "" {
		return field, jsonTagOptions{}
	}

	parts := bytes.Split([]byte(tag), []byte{','})
	name := string(parts[0])
	if name == "" {
		name = field
	}

	opts := jsonTagOptions{}
	for _, opt := range parts[1:] {
		if string(opt) == "omitempty" {
			opts.omitempty = true
		}
	}

	return name, opts
}

func isZero(val reflect.Value) bool {
	switch val.Kind() {
	case reflect.Pointer, reflect.Interface, reflect.Chan, reflect.Func, reflect.Map, reflect.Slice:
		return val.IsNil()
	default:
		return val.IsZero()
	}
}

func assignMapKey(target reflect.Value, key string) error {
	switch target.Kind() {
	case reflect.String:
		target.SetString(key)
		return nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return decodeThroughJSON(target, key)
	default:
		return fmt.Errorf("unsupported map key type %s", target.Type())
	}
}
