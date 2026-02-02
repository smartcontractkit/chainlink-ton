package parser

import (
	"errors"
	"math/big"
)

// ErrMalformedLispTuple is returned when the tuple structure doesn't match the expected lisp list format.
var ErrMalformedLispTuple = errors.New("malformed lisp tuple: unexpected type in tuple structure")

// ParseLispTuple parses the result of a get method call that returns a Lisp-style list of uint64 selectors.
// Returns an error if the tuple structure is malformed (e.g., unexpected types), which can indicate
// ABI mismatches or contract regressions. An empty input tuple returns nil without error.
func ParseLispTuple(tuple []any) ([]uint64, error) {
	if len(tuple) == 0 {
		return nil, nil
	}

	// The first element is the lisp list contains [big.Int, [big.Int, [...]]]
	rawList := tuple[0]

	// nil first element means an empty list (valid)
	if rawList == nil {
		return nil, nil
	}

	lispList, ok := rawList.([]any)
	if !ok {
		return nil, ErrMalformedLispTuple
	}

	var result []uint64
	var bi *big.Int
	var next []any
	for len(lispList) == 2 {
		if bi, ok = lispList[0].(*big.Int); !ok {
			return nil, ErrMalformedLispTuple
		}
		result = append(result, bi.Uint64())

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

// ParseLispTupleBigInt parses the result of a get method call that returns a Lisp-style list of big.Int values.
// This is useful for values larger than uint64, such as uint128 curse subjects.
// Returns an error if the tuple structure is malformed (e.g., unexpected types), which can indicate
// ABI mismatches or contract regressions. An empty input tuple returns nil without error.
func ParseLispTupleBigInt(tuple []any) ([]*big.Int, error) {
	if len(tuple) == 0 {
		return nil, nil
	}

	// The first element is the lisp list contains [big.Int, [big.Int, [...]]]
	rawList := tuple[0]

	// nil first element means an empty list (valid)
	if rawList == nil {
		return nil, nil
	}

	lispList, ok := rawList.([]any)
	if !ok {
		return nil, ErrMalformedLispTuple
	}

	var result []*big.Int
	var bi *big.Int
	var next []any
	for len(lispList) == 2 {
		if bi, ok = lispList[0].(*big.Int); !ok {
			return nil, ErrMalformedLispTuple
		}
		result = append(result, bi)

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
