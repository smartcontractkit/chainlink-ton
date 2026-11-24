package ton

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestEncodeDataCellFor(t *testing.T) {
	want := cell.BeginCell().MustStoreUInt(42, 32).EndCell()

	t.Run("cell", func(t *testing.T) {
		got, err := encodeDataCellFor(want)
		require.NoError(t, err)
		require.Equal(t, want.Hash(), got.Hash())
	})

	t.Run("resolved cell after JSON round trip", func(t *testing.T) {
		raw, err := json.Marshal(map[string]any{"data": want})
		require.NoError(t, err)
		var msg DeployMessage[any, any]
		require.NoError(t, json.Unmarshal(raw, &msg))

		got, err := encodeDataCellFor(msg.Data)
		require.NoError(t, err)
		require.Equal(t, want.Hash(), got.Hash())
	})

	t.Run("struct", func(t *testing.T) {
		got, err := encodeDataCellFor(&struct {
			V uint32 `tlb:"## 32"`
		}{V: 42})
		require.NoError(t, err)
		require.Equal(t, want.Hash(), got.Hash())
	})

	t.Run("invalid base64", func(t *testing.T) {
		_, err := encodeDataCellFor("not base64!")
		require.Error(t, err)
	})
}
