package tlbe // tlb extras

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Dict[K comparable, V any] struct {
	entries map[K]V
}

func NewEmptyDict[K comparable, V any]() *Dict[K, V] {
	return &Dict[K, V]{
		entries: make(map[K]V),
	}
}

func NewDict[K comparable, V any](dict *cell.Dictionary) (*Dict[K, V], error) {
	d := &Dict[K, V]{}
	if err := d.LoadFromDictionary(dict); err != nil {
		return nil, fmt.Errorf("cannot load Dict from *cell.Dictionary: %w", err)
	}
	return d, nil
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

func (d Dict[K, V]) MarshalJSON() ([]byte, error) {
	return json.Marshal(d.entries)
}

func (d *Dict[K, V]) UnmarshalJSON(data []byte) error {
	if d == nil {
		return errors.New("invalid nil receiver")
	}

	if len(data) == 0 {
		d.entries = make(map[K]V)
		return nil
	}

	if err := json.Unmarshal(data, &d.entries); err != nil {
		return fmt.Errorf("cannot unmarshal Dict: %w", err)
	}

	return nil
}

func (d Dict[K, V]) AsDictionary() (*cell.Dictionary, error) {
	bits, err := keyBitSize[K]()
	if err != nil {
		return nil, err
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

	var root *cell.Cell
	if len(d.entries) > 0 {
		root = dict.AsCell()
	}

	builder := cell.BeginCell()
	err = builder.StoreMaybeRef(root)
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
		return err
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

var dictKeyType = reflect.TypeOf((*DictKey)(nil)).Elem()

func keyBitSize[K any]() (uint, error) {
	typ := reflect.TypeOf((*K)(nil)).Elem()
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
	}

	return 0
}
