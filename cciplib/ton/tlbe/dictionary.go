package tlbe // tlb extras

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"slices"
	"strings"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Dict[K comparable, V any] struct {
	entries map[K]V
}

func NewEmptyDict[K comparable, V any]() *Dict[K, V] {
	return NewDict(make(map[K]V))
}

func NewDict[K comparable, V any](entries map[K]V) *Dict[K, V] {
	return &Dict[K, V]{entries}
}

func NewDictFromDictionary[K comparable, V any](dict *cell.Dictionary) (*Dict[K, V], error) {
	d := &Dict[K, V]{}
	if err := d.LoadFromDictionary(dict); err != nil {
		return nil, fmt.Errorf("cannot load Dict from *cell.Dictionary: %w", err)
	}
	return d, nil
}

func NewDictFromSlice[K integerKey, V any](data []V) (*Dict[K, V], error) {
	d := NewEmptyDict[K, V]()

	for i, v := range data {
		key, err := toIntKey[K](i)
		if err != nil {
			return nil, fmt.Errorf("cannot convert index %d to key: %w", i, err)
		}
		d.Set(key, v)
	}
	return d, nil
}

// integerKey is a constraint that matches all integer types.
type integerKey interface {
	~int | ~int8 | ~int16 | ~int32 | ~int64 |
		~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64 | ~uintptr
}

// toIntKey converts an integer index to the specified integer key type K,
// ensuring that the conversion does not overflow.
func toIntKey[K integerKey](i int) (K, error) {
	var zero K
	switch any(zero).(type) {
	case uint8:
		if i < 0 || i > math.MaxUint8 {
			return zero, fmt.Errorf("index %d overflows uint8", i)
		}
		return K(uint8(i)), nil
	case uint16:
		if i < 0 || i > math.MaxUint16 {
			return zero, fmt.Errorf("index %d overflows uint16", i)
		}
		return K(uint16(i)), nil
	case uint32:
		if i < 0 || i > math.MaxUint32 {
			return zero, fmt.Errorf("index %d overflows uint32", i)
		}
		return K(uint32(i)), nil
	case uint64:
		if i < 0 {
			return zero, fmt.Errorf("index %d overflows uint64", i)
		}
		return K(uint64(i)), nil
	case uint:
		if i < 0 {
			return zero, fmt.Errorf("index %d overflows uint", i)
		}
		return K(uint(i)), nil
	case int8:
		if i < math.MinInt8 || i > math.MaxInt8 {
			return zero, fmt.Errorf("index %d overflows int8", i)
		}
		return K(int8(i)), nil
	case int16:
		if i < math.MinInt16 || i > math.MaxInt16 {
			return zero, fmt.Errorf("index %d overflows int16", i)
		}
		return K(int16(i)), nil
	case int32:
		if i < math.MinInt32 || i > math.MaxInt32 {
			return zero, fmt.Errorf("index %d overflows int32", i)
		}
		return K(int32(i)), nil
	case int64:
		return K(int64(i)), nil
	case int:
		return K(i), nil
	default:
		return zero, fmt.Errorf("unsupported key type %T", zero)
	}
}

func (d *Dict[K, V]) ensure() {
	if d.entries == nil {
		d.entries = make(map[K]V)
	}
}

func (d *Dict[K, V]) Set(key K, value V) {
	if d == nil {
		return
	}
	d.ensure()
	d.entries[key] = value
}

func (d *Dict[K, V]) Delete(key K) {
	if d == nil || d.entries == nil {
		return
	}
	delete(d.entries, key)
}

func (d *Dict[K, V]) Get(key K) (V, bool) {
	var zero V
	if d == nil || d.entries == nil {
		return zero, false
	}
	v, ok := d.entries[key]
	return v, ok
}

func (d Dict[K, V]) Len() int {
	if d.entries == nil {
		return 0
	}
	return len(d.entries)
}

func (d *Dict[K, V]) AsMap() map[K]V {
	d.ensure()
	return d.entries
}

// pair represents a key-value pair (entry) in the dictionary,
// and is used for JSON marshalling/unmarshalling - supports keys that are not
// directly representable in JSON object keys.
type pair[K comparable, V any] struct {
	Key   K `json:"key"`
	Value V `json:"value"`
}

// MarshalJSON implements the [encoding/json.Marshaler] interface,
// serializing the dictionary as an array of key-value pairs.
func (d Dict[K, V]) MarshalJSON() ([]byte, error) {
	pairs := make([]pair[K, V], 0, len(d.entries))
	for k, v := range d.entries {
		pairs = append(pairs, pair[K, V]{Key: k, Value: v})
	}

	// Sort output pairs by key string representation (Dictionary is an ordered map)
	slices.SortFunc(pairs, func(a, b pair[K, V]) int {
		return strings.Compare(fmt.Sprint(a.Key), fmt.Sprint(b.Key))
	})

	return json.Marshal(pairs)
}

// UnmarshalJSON implements the [encoding/json.Unmarshaler] interface,
// deserializing the dictionary from an array of key-value pairs.
func (d *Dict[K, V]) UnmarshalJSON(data []byte) error {
	if d == nil {
		return errors.New("invalid nil receiver")
	}

	if len(data) == 0 || string(data) == "[]" {
		d.entries = make(map[K]V)
		return nil
	}

	var pairs []pair[K, V]
	if err := json.Unmarshal(data, &pairs); err != nil {
		return fmt.Errorf("cannot unmarshal Dict: %w", err)
	}

	d.entries = make(map[K]V, len(pairs))
	for _, p := range pairs {
		d.entries[p.Key] = p.Value
	}

	return nil
}

func (d Dict[K, V]) AsDictionary() (*cell.Dictionary, error) {
	bits, err := keyBitSize[K]()
	if err != nil {
		return nil, fmt.Errorf("cannot determine key bit size: %w", err)
	}

	dict := cell.NewDict(bits)

	for key, value := range d.entries {
		keyCell, err := ToCell(key)
		if err != nil {
			return nil, fmt.Errorf("cannot encode key: %w", err)
		}

		if keyCell.BitsSize() != bits {
			return nil, fmt.Errorf("invalid key: produced %d bits, expected %d", keyCell.BitsSize(), bits)
		}

		valueCell, err := ToCell(value)
		if err != nil {
			return nil, fmt.Errorf("cannot encode value: %w", err)
		}
		if err := dict.Set(keyCell, valueCell); err != nil {
			return nil, fmt.Errorf("cannot attach entry: %w", err)
		}
	}

	return dict, nil
}

func (d *Dict[K, V]) LoadFromDictionary(dict *cell.Dictionary) error {
	if dict == nil || dict.IsEmpty() {
		d.entries = make(map[K]V)
		return nil
	}

	kvs, err := dict.LoadAll()
	if err != nil {
		return fmt.Errorf("cannot load all entries: %w", err)
	}

	d.entries = make(map[K]V, len(kvs))
	for _, kv := range kvs {
		var key K
		if err := LoadFromCell(&key, kv.Key.Copy()); err != nil {
			return fmt.Errorf("cannot decode key: %w", err)
		}

		var value V
		if err := LoadFromCell(&value, kv.Value.Copy()); err != nil {
			return fmt.Errorf("cannot decode value: %w", err)
		}
		d.entries[key] = value
	}

	return nil
}

func (d Dict[K, V]) ToCell() (*cell.Cell, error) {
	dict, err := d.AsDictionary()
	if err != nil {
		return nil, fmt.Errorf("cannot make *cell.Dictionary: %w", err)
	}

	builder := cell.BeginCell()
	err = builder.StoreDict(dict)
	if err != nil {
		return nil, fmt.Errorf("cannot store dictionary ref: %w", err)
	}

	return builder.EndCell(), nil
}

func (d *Dict[K, V]) LoadFromCell(slice *cell.Slice) error {
	if d == nil {
		return errors.New("invalid nil receiver")
	}

	bits, err := keyBitSize[K]()
	if err != nil {
		return fmt.Errorf("cannot determine key bit size: %w", err)
	}

	dict, err := slice.LoadDict(bits)
	if err != nil {
		return fmt.Errorf("cannot load dictionary: %w", err)
	}

	return d.LoadFromDictionary(dict)
}

type DictKey interface {
	BitsLen() uint
}

var dictKeyType = reflect.TypeFor[DictKey]()

func keyBitSize[K any]() (uint, error) {
	typ := reflect.TypeFor[K]()
	if bits := lookupDictKeyBits(typ); bits != 0 {
		return bits, nil
	}
	return 0, fmt.Errorf("unsupported key type %s", typ.String())
}

func lookupDictKeyBits(t reflect.Type) uint {
	if t == nil {
		return 0
	}

	if t.Implements(dictKeyType) {
		var inst DictKey
		if t.Kind() == reflect.Pointer {
			inst = reflect.New(t.Elem()).Interface().(DictKey)
		} else {
			inst = reflect.New(t).Elem().Interface().(DictKey)
		}
		return inst.BitsLen()
	}

	if t.Kind() != reflect.Pointer {
		ptr := reflect.PointerTo(t)
		if ptr.Implements(dictKeyType) {
			inst := reflect.New(t).Interface().(DictKey)
			return inst.BitsLen()
		}
	}

	switch t.Kind() {
	case reflect.Uint8:
		return 8
	case reflect.Uint16:
		return 16
	case reflect.Uint32:
		return 32
	case reflect.Uint64, reflect.Uint:
		return 64
	case reflect.Int8:
		return 8
	case reflect.Int16:
		return 16
	case reflect.Int32:
		return 32
	case reflect.Int64, reflect.Int:
		return 64
	default:
		return 0
	}
}
