package tlbe // tlb extras

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func TestCellJSONRoundTrip(t *testing.T) {
	// Create a sample InternalMessage
	addr := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c")
	body := cell.BeginCell().MustStoreUInt(12345, 32).EndCell()

	internalMsg := tlb.InternalMessage{
		IHRDisabled: true,
		Bounce:      true,
		DstAddr:     addr,
		Amount:      tlb.MustFromTON("1.5"),
		Body:        body,
	}

	// Create a Cell[tlb.InternalMessage]
	c, err := NewCellFrom(internalMsg)
	require.NoError(t, err)
	require.NotNil(t, c)

	// Marshal to JSON
	jsonData, err := json.Marshal(c)
	require.NoError(t, err)
	require.NotEmpty(t, jsonData)

	// Unmarshal from JSON
	var c2 *Cell[tlb.InternalMessage]
	err = json.Unmarshal(jsonData, &c2)
	require.NoError(t, err)

	// Compare cell hashes to ensure the full structure is the same
	// This is the most reliable way to compare the cells
	require.Equal(t, c.ToCell().Hash(), c2.ToCell().Hash())

	// Also verify the JSON representation is consistent
	jsonData2, err := json.Marshal(c2)
	require.NoError(t, err)
	require.JSONEq(t, string(jsonData), string(jsonData2))

	// Finally, convert back to value and compare
	msg1, err := c.ToValue()
	require.NoError(t, err)
	msg1c, err := tlb.ToCell(msg1)
	require.NoError(t, err)
	require.Equal(t, c.ToCell().Hash(), msg1c.Hash())

	msg2, err := c2.ToValue()
	require.NoError(t, err)
	msg2c, err := tlb.ToCell(msg2)
	require.NoError(t, err)
	require.Equal(t, c2.ToCell().Hash(), msg2c.Hash())
}

func TestCellRejectsPointerTypes(t *testing.T) {
	// Attempt to create a Cell with a pointer type parameter
	addr := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c")
	body := cell.BeginCell().MustStoreUInt(54321, 32).EndCell()

	internalMsg := &tlb.InternalMessage{
		IHRDisabled: true,
		Bounce:      false,
		DstAddr:     addr,
		Amount:      tlb.MustFromTON("0.5"),
		Body:        body,
	}

	// This should fail with a clear error message
	_, err := NewCellFrom(internalMsg) // internalMsg is *tlb.InternalMessage, so T = *tlb.InternalMessage
	require.Error(t, err)
	require.Contains(t, err.Error(), "must be a value type, not a pointer type")
}
