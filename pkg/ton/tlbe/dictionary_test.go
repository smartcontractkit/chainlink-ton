package tlbe // tlb extras

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestDictJSONRoundTrip(t *testing.T) {
	dict := Dict[TestKey, testValue]{}
	dict.Set(TestKey(2), testValue{Sum: 200})
	dict.Set(TestKey(1), testValue{Sum: 100})

	payload, err := json.Marshal(dict)
	require.NoError(t, err)
	require.JSONEq(t, `{"1": {"sum":100},"2": {"sum":200}}`, string(payload))

	var decoded Dict[TestKey, testValue]
	require.NoError(t, json.Unmarshal(payload, &decoded))
	require.Equal(t, dict.entries, decoded.entries)
}

func TestDictCellRoundTrip(t *testing.T) {
	dict := Dict[TestKey, testValue]{}
	dict.Set(TestKey(1), testValue{Sum: 11})
	dict.Set(TestKey(5), testValue{Sum: 55})
	dict.Set(TestKey(9), testValue{Sum: 99})

	encoded, err := dict.ToCell()
	require.NoError(t, err)

	restored := Dict[TestKey, testValue]{}
	require.NoError(t, restored.LoadFromCell(encoded.BeginParse()))
	require.Equal(t, dict.entries, restored.entries)

	slice := encoded.BeginParse()
	tonDict, err := slice.LoadDict(16)
	require.NoError(t, err)

	expected := cell.NewDict(16)
	for key, value := range dict.entries {
		keyCell, err := key.ToCell()
		require.NoError(t, err)
		valueCell, err := tlb.ToCell(value)
		require.NoError(t, err)
		require.NoError(t, expected.Set(keyCell, valueCell))
	}

	expectedCell := expected.AsCell()
	require.NotNil(t, expectedCell)
	require.NotNil(t, tonDict)

	hashA := expectedCell.Hash()
	hashB := tonDict.AsCell().Hash()
	require.Equal(t, hashA, hashB)
}

func TestDictEmptyRoundTrip(t *testing.T) {
	var dict Dict[TestKey, testValue]

	encoded, err := dict.ToCell()
	require.NoError(t, err)

	var restored Dict[TestKey, testValue]
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

	bits, err = keyBitSize[TestKey]()
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
