// Package tlbe is a temporary compatibility shim that re-exports the public
// API of github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe that is still used by
// this repo's dependent modules (deployment, devenv, integration-tests,
// staging-monitor) and by mcms v0.45.0.
//
// The real implementation lives in the standalone cciplib module. Symbols are
// re-exported as aliases (=) so their identity matches cciplib's exactly.
//
// DELETE this shim once all consumers import the cciplib path directly.
package tlbe

import (
	"github.com/xssnick/tonutils-go/tvm/cell"

	src "github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
)

type Cell[T any] = src.Cell[T]
type Dict[K comparable, V any] = src.Dict[K, V]
type Uint160 = src.Uint160
type Uint256 = src.Uint256

// integerKey mirrors cciplib/ton/tlbe.integerKey so the generic NewDictFromSlice
// can be re-exported. The cciplib constraint is unexported and cannot be named
// from this package; Go verifies that this constraint's type set is identical,
// so every K allowed here also satisfies cciplib's integerKey.
type integerKey interface {
	~int | ~int8 | ~int16 | ~int32 | ~int64 |
		~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64 | ~uintptr
}

func ManyCellsFrom[T any](values []T) ([]*Cell[T], error) {
	return src.ManyCellsFrom[T](values)
}

func NewCellFrom[T any](v T) (*Cell[T], error) {
	return src.NewCellFrom[T](v)
}

func NewDictFromDictionary[K comparable, V any](dict *cell.Dictionary) (*Dict[K, V], error) {
	return src.NewDictFromDictionary[K, V](dict)
}

func NewDictFromSlice[K integerKey, V any](data []V) (*Dict[K, V], error) {
	return src.NewDictFromSlice[K, V](data)
}

func NewEmptyDict[K comparable, V any]() *Dict[K, V] {
	return src.NewEmptyDict[K, V]()
}

var NewUint160 = src.NewUint160
var NewUint256 = src.NewUint256
