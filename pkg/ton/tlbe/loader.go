package tlbe // tlb extras

import (
	"fmt"
	"reflect"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// ToCell is a helper that encodes basic types directly,
// and falls back to tlb.ToCell for others.
func ToCell(v any) (*cell.Cell, error) {
	switch reflect.TypeOf(v).Kind() {
	case reflect.Bool:
		return cell.BeginCell().MustStoreBoolBit(v.(bool)).EndCell(), nil
	case reflect.Uint8:
		return cell.BeginCell().MustStoreUInt(uint64(v.(uint8)), 8).EndCell(), nil
	case reflect.Uint16:
		return cell.BeginCell().MustStoreUInt(uint64(v.(uint16)), 16).EndCell(), nil
	case reflect.Uint32:
		return cell.BeginCell().MustStoreUInt(uint64(v.(uint32)), 32).EndCell(), nil
	case reflect.Uint64, reflect.Uint:
		return cell.BeginCell().MustStoreUInt(v.(uint64), 64).EndCell(), nil
	case reflect.Int8:
		return cell.BeginCell().MustStoreInt(int64(v.(int8)), 8).EndCell(), nil
	case reflect.Int16:
		return cell.BeginCell().MustStoreInt(int64(v.(int16)), 16).EndCell(), nil
	case reflect.Int32:
		return cell.BeginCell().MustStoreInt(int64(v.(int32)), 32).EndCell(), nil
	case reflect.Int64, reflect.Int:
		return cell.BeginCell().MustStoreInt(v.(int64), 64).EndCell(), nil
	default:
		return tlb.ToCell(v)
	}
}

// LoadFromCell is a helper that decodes basic types directly,
// and falls back to tlb.LoadFromCell for others.
func LoadFromCell(v any, loader *cell.Slice, skipMagic ...bool) error {
	switch reflect.TypeOf(v).Elem().Kind() {
	case reflect.Bool:
		val, err := loader.LoadBoolBit()
		if err != nil {
			return fmt.Errorf("cannot load bool: %w", err)
		}
		reflect.ValueOf(v).Elem().SetBool(val)
		return nil
	case reflect.Uint8:
		val, err := loader.LoadUInt(8)
		if err != nil {
			return fmt.Errorf("cannot load uint8: %w", err)
		}
		reflect.ValueOf(v).Elem().SetUint(val)
		return nil
	case reflect.Uint16:
		val, err := loader.LoadUInt(16)
		if err != nil {
			return fmt.Errorf("cannot load uint16: %w", err)
		}
		reflect.ValueOf(v).Elem().SetUint(val)
		return nil
	case reflect.Uint32:
		val, err := loader.LoadUInt(32)
		if err != nil {
			return fmt.Errorf("cannot load uint32: %w", err)
		}
		reflect.ValueOf(v).Elem().SetUint(val)
		return nil
	case reflect.Uint64, reflect.Uint:
		val, err := loader.LoadUInt(64)
		if err != nil {
			return fmt.Errorf("cannot load uint64: %w", err)
		}
		reflect.ValueOf(v).Elem().SetUint(val)
		return nil
	case reflect.Int8:
		val, err := loader.LoadInt(8)
		if err != nil {
			return fmt.Errorf("cannot load int8: %w", err)
		}
		reflect.ValueOf(v).Elem().SetInt(val)
		return nil
	case reflect.Int16:
		val, err := loader.LoadInt(16)
		if err != nil {
			return fmt.Errorf("cannot load int16: %w", err)
		}
		reflect.ValueOf(v).Elem().SetInt(val)
		return nil
	case reflect.Int32:
		val, err := loader.LoadInt(32)
		if err != nil {
			return fmt.Errorf("cannot load int32: %w", err)
		}
		reflect.ValueOf(v).Elem().SetInt(val)
		return nil
	case reflect.Int64, reflect.Int:
		val, err := loader.LoadInt(64)
		if err != nil {
			return fmt.Errorf("cannot load int64: %w", err)
		}
		reflect.ValueOf(v).Elem().SetInt(val)
		return nil
	default:
		return tlb.LoadFromCell(v, loader, skipMagic...)
	}
}
