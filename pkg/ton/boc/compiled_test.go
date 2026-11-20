package boc

import (
	"encoding/hex"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestParseTolkCompiledContract(t *testing.T) {
	code := cell.BeginCell().MustStoreUInt(0xdeadbeef, 32).MustStoreRef(cell.BeginCell().MustStoreUInt(1, 8).EndCell()).EndCell()

	t.Run("valid", func(t *testing.T) {
		data := fmt.Appendf(nil, `{"hex":%q}`, hex.EncodeToString(code.ToBOC()))

		got, err := ParseTolkCompiledContract(data)
		require.NoError(t, err)
		require.Equal(t, code.Hash(), got.Hash())
	})

	for name, tc := range map[string]struct {
		data   string
		errMsg string
	}{
		"invalid json": {data: `{`, errMsg: "failed to parse JSON"},
		"missing hex":  {data: `{}`, errMsg: "hex field is empty"},
		"invalid hex":  {data: `{"hex":"zz"}`, errMsg: "failed to decode hex"},
		"invalid boc":  {data: `{"hex":"deadbeef"}`, errMsg: "failed to parse BOC binary"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := ParseTolkCompiledContract([]byte(tc.data))
			require.ErrorContains(t, err, tc.errMsg)
		})
	}
}
