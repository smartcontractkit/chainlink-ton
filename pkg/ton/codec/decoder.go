package codec

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"

	"github.com/samber/lo"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

var ErrUnknownMessage = errors.New("unknown message type")

func DecodeTLBCellToAny(c *cell.Cell, tlbs tvm.TLBMap) (any, error) {
	if c == nil {
		return nil, errors.New("can't decode nil as cell")
	}

	// Try to decode *cell.Cell as one of the TLBs type by reading the opcode
	r := c.BeginParse()
	if r.BitsLeft() == 0 {
		return nil, ErrUnknownMessage
	}
	opcode, err := r.PreloadUInt(32)
	if err != nil {
		return nil, fmt.Errorf("failed to preload opcode: %w", err)
	}

	i, ok := tlbs[opcode]
	if !ok {
		return nil, ErrUnknownMessage
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

func DecodeTLBStructToJSON(v any, tlbs tvm.TLBMap) (string, map[string]any, error) {
	// Checks if a value is nil or if it's a reference type with a nil underlying value.
	if lo.IsNil(v) {
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
		if rv.Kind() == reflect.Pointer {
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

func DecodeTLBValToJSON(v any, tlbs tvm.TLBMap) (string, any, error) {
	// Checks if a value is nil or if it's a reference type with a nil underlying value.
	if lo.IsNil(v) {
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
			jmType := reflect.TypeFor[json.Marshaler]()
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
func DecodeTLBStructKeys(v any, tlbs tvm.TLBMap) ([]string, error) {
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
		if rv.Kind() == reflect.Pointer {
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
