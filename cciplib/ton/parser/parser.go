package parser

import (
	"errors"
	"math/big"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

// lispTupleItem constrains the types that can be parsed from a lisp tuple.
// These are the types that ExecutionResult can return.
type lispTupleItem interface {
	*big.Int | *cell.Cell | *cell.Slice
}

// ErrMalformedLispTuple is returned when the tuple structure doesn't match the expected lisp list format.
var ErrMalformedLispTuple = errors.New("malformed lisp tuple: unexpected type in tuple structure")

// ParseLispTuple parses the result of a get method call that returns a Lisp-style list.
// T must be one of the types that ExecutionResult returns: *big.Int, *cell.Cell, or *cell.Slice.
// Returns an error if the tuple structure is malformed (e.g., unexpected types), which can indicate
// ABI mismatches or contract regressions. An empty input tuple returns nil without error.
//
// To convert []*big.Int to []uint64, use lo.Map:
//
//	selectors := lo.Map(result, func(x *big.Int, _ int) uint64 { return x.Uint64() })
func ParseLispTuple[T lispTupleItem](tuple []any) ([]T, error) {
	if len(tuple) == 0 {
		return nil, nil
	}

	// The first element is the lisp list contains [T, [T, [...]]]
	rawList := tuple[0]

	// nil first element means an empty list (valid)
	if rawList == nil {
		return nil, nil
	}

	lispList, ok := rawList.([]any)
	if !ok {
		return nil, ErrMalformedLispTuple
	}

	var result []T
	var val T
	var next []any
	for len(lispList) == 2 {
		if val, ok = lispList[0].(T); !ok {
			return nil, ErrMalformedLispTuple
		}
		result = append(result, val)

		// nil tail means end of list (valid)
		if lispList[1] == nil {
			break
		}
		if next, ok = lispList[1].([]any); !ok {
			return nil, ErrMalformedLispTuple
		}
		lispList = next
	}
	return result, nil
}
