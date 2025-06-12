package counter

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestSetCount_TlbEncodingDecoding(t *testing.T) {
	original := SetCount{
		QueryID:  123456789,
		NewCount: 42,
	}

	// Encode to cell
	c, err := tlb.ToCell(original)
	require.NoError(t, err, "tlb.ToCell encoding failed")
	require.Equal(t, "128[0000000400000000075BCD150000002A]", c.Dump())

	c1 := cell.BeginCell()
	err = original.StoreArgs(c1)
	require.NoError(t, err)
	// Notice: serializing with StoreArgs skips the opcode as the tracetracking package will add (duplicate) it
	// TODO: fix HACK - standardise go bindings and tlb serialization/deserialization
	require.Equal(t, "96[00000000075BCD150000002A]", c1.EndCell().Dump())

	// Decode from cell
	var decoded SetCount
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err, "tlb.LoadFromCell decoding failed")

	require.Equal(t, original.QueryID, decoded.QueryID, "QueryID mismatch after decoding")
	require.Equal(t, original.NewCount, decoded.NewCount, "NewCount mismatch after decoding")
}

func TestIncreaseCount_TlbEncodingDecoding(t *testing.T) {
	original := IncreaseCount{
		QueryID: 123456789,
	}

	// Encode to cell
	c, err := tlb.ToCell(original)
	require.NoError(t, err, "tlb.ToCell encoding failed")
	require.Equal(t, "96[1000000500000000075BCD15]", c.Dump())

	// Decode from cell
	var decoded IncreaseCount
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err, "tlb.LoadFromCell decoding failed")

	require.Equal(t, original.QueryID, decoded.QueryID, "QueryID mismatch after decoding")
}
