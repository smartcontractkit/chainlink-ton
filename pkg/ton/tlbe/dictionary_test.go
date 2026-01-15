package tlbe // tlb extras

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type Foo struct {
	Dict *cell.Dictionary `tlb:"dict 16"`
}

type ValWrapper struct {
	Value uint32 `tlb:"## 32"`
}

type Bar struct {
	Dict *Dict[uint16, uint32] `tlb:"."`
}

func TestCellDictionaryEquivalence(t *testing.T) {
	foo := Foo{}
	var err error
	foo.Dict, err = tvm.MakeDictFrom([]ValWrapper{
		{Value: 100},
		{Value: 200},
	}, 16)
	require.NoError(t, err)

	bar := Bar{}
	bar.Dict, err = NewDictFromSlice[uint16]([]uint32{100, 200})
	require.NoError(t, err)

	fooCell, err := tlb.ToCell(foo)
	require.NoError(t, err)

	barCell, err := tlb.ToCell(bar)
	require.NoError(t, err)

	require.Equal(t, fooCell, barCell)
	require.Equal(t, fooCell.Hash(), barCell.Hash())
}

func TestDictJSONRoundTrip(t *testing.T) {
	dict := Dict[uint16, testValue]{}
	dict.Set(2, testValue{Sum: 200})
	dict.Set(1, testValue{Sum: 100})

	payload, err := json.Marshal(dict)
	require.NoError(t, err)
	require.JSONEq(t, `[{"key":1,"value":{"sum":100}}, {"key":2,"value":{"sum":200}}]`, string(payload))

	var decoded Dict[uint16, testValue]
	require.NoError(t, json.Unmarshal(payload, &decoded))
	require.Equal(t, dict.entries, decoded.entries)
}

func TestDictCellRoundTrip(t *testing.T) {
	dict := Dict[uint16, testValue]{}
	dict.Set(1, testValue{Sum: 11})
	dict.Set(5, testValue{Sum: 55})
	dict.Set(9, testValue{Sum: 99})

	encoded, err := dict.ToCell()
	require.NoError(t, err)

	restored := Dict[uint16, testValue]{}
	require.NoError(t, restored.LoadFromCell(encoded.BeginParse()))
	require.Equal(t, dict.entries, restored.entries)

	slice := encoded.BeginParse()
	tonDict, err := slice.LoadDict(16)
	require.NoError(t, err)

	ddict, err := dict.AsDictionary()
	require.NoError(t, err)
	expectedCell := ddict.AsCell()
	require.NotNil(t, expectedCell)
	require.NotNil(t, tonDict)

	hashA := expectedCell.Hash()
	hashB := tonDict.AsCell().Hash()
	require.Equal(t, hashA, hashB)
}

func TestDictEmptyRoundTrip(t *testing.T) {
	var dict Dict[uint16, testValue]

	encoded, err := dict.ToCell()
	require.NoError(t, err)

	var restored Dict[uint16, testValue]
	require.NoError(t, restored.LoadFromCell(encoded.BeginParse()))
	require.Equal(t, 0, restored.Len())

	slice := encoded.BeginParse()
	loadedDict, err := slice.LoadDict(16)
	require.NoError(t, err)
	require.True(t, loadedDict == nil || loadedDict.IsEmpty())
}

func TestKeyBitSizeDetection(t *testing.T) {
	bits, err := keyBitSize[uint16]()
	require.NoError(t, err)
	require.Equal(t, uint(16), bits)

	bits, err = keyBitSize[uint16]()
	require.NoError(t, err)
	require.Equal(t, uint(16), bits)

	_, err = keyBitSize[struct{}]()
	require.Error(t, err)
}

func TestDictRejectsMismatchedKeyWidth(t *testing.T) {
	dict := Dict[badKey, testValue]{}
	dict.Set(badKey{}, testValue{Sum: 10})

	_, err := dict.ToCell()
	require.EqualError(t, err, "cannot make *cell.Dictionary: invalid key: produced 32 bits, expected 16")
}

type testValue struct {
	Sum uint32 `tlb:"## 32" json:"sum"`
}

type badKey struct{}

func (badKey) ToCell() (*cell.Cell, error) {
	builder := cell.BeginCell()
	if err := builder.StoreUInt(0, 32); err != nil {
		return nil, err
	}
	return builder.EndCell(), nil
}

func (badKey) BitsLen() uint {
	return 16
}
