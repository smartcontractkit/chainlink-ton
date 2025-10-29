package parser

import "math/big"

// ParseLispTuple parses the result of a get method call that returns a Lisp-style list of uint64 selectors.
func ParseLispTuple(tuple []any) []uint64 {
	if len(tuple) == 0 {
		return nil
	}

	var result []uint64
	// The first element is the lisp list contains [big.Int, [big.Int, [...]]]
	rawList := tuple[0]
	lispList, ok := rawList.([]any)
	if !ok || lispList == nil {
		return result
	}

	var bi *big.Int
	var next []any
	for len(lispList) == 2 {
		if bi, ok = lispList[0].(*big.Int); ok {
			result = append(result, bi.Uint64())
		}
		if next, ok = lispList[1].([]any); !ok || next == nil {
			break
		}
		lispList = next
	}
	return result
}
