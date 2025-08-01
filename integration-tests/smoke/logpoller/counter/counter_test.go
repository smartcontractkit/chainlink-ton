package counter

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestStorage_TLBEncodeDecode(t *testing.T) {
	orig := Storage{
		ID:    12345,
		Value: 67890,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded Storage
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.ID, decoded.ID)
	require.Equal(t, orig.Value, decoded.Value)
}

func TestStorage_TLBEncodeDecode_ZeroValues(t *testing.T) {
	orig := Storage{
		ID:    0,
		Value: 0,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded Storage
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.ID, decoded.ID)
	require.Equal(t, orig.Value, decoded.Value)
}

func TestStorage_TLBEncodeDecode_MaxValues(t *testing.T) {
	orig := Storage{
		ID:    0xFFFFFFFF, // Max uint32
		Value: 0xFFFFFFFF, // Max uint32
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded Storage
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.ID, decoded.ID)
	require.Equal(t, orig.Value, decoded.Value)
}

func TestSetCountMsg_TLBEncodeDecode(t *testing.T) {
	orig := SetCountMsg{
		OpCode:  SetCountOpCode,
		QueryID: 9876543210,
		Value:   42,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded SetCountMsg
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.OpCode, decoded.OpCode)
	require.Equal(t, orig.QueryID, decoded.QueryID)
	require.Equal(t, orig.Value, decoded.Value)
}

func TestSetCountMsg_TLBEncodeDecode_WithCorrectOpCode(t *testing.T) {
	orig := SetCountMsg{
		OpCode:  0x10000004, // Explicit opcode value
		QueryID: 1234567890,
		Value:   100,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded SetCountMsg
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, uint32(0x10000004), decoded.OpCode)
	require.Equal(t, orig.QueryID, decoded.QueryID)
	require.Equal(t, orig.Value, decoded.Value)
}

func TestIncreaseCountMsg_TLBEncodeDecode(t *testing.T) {
	orig := IncreaseCountMsg{
		OpCode:  IncreaseCounterOpCode,
		QueryID: 5555555555,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded IncreaseCountMsg
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.OpCode, decoded.OpCode)
	require.Equal(t, orig.QueryID, decoded.QueryID)
}

func TestIncreaseCountMsg_TLBEncodeDecode_WithCorrectOpCode(t *testing.T) {
	orig := IncreaseCountMsg{
		OpCode:  0x10000005,         // Explicit opcode value
		QueryID: 0xFFFFFFFFFFFFFFFF, // Max uint64
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded IncreaseCountMsg
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, uint32(0x10000005), decoded.OpCode)
	require.Equal(t, orig.QueryID, decoded.QueryID)
}

func TestCountSetEvent_TLBEncodeDecode(t *testing.T) {
	orig := CountSetEvent{
		ID:    999,
		Value: 777,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded CountSetEvent
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.ID, decoded.ID)
	require.Equal(t, orig.Value, decoded.Value)
}

func TestCountIncreasedEvent_TLBEncodeDecode(t *testing.T) {
	orig := CountIncreasedEvent{
		ID:    888,
		Value: 999,
	}

	c, err := tlb.ToCell(orig)
	require.NoError(t, err)

	var decoded CountIncreasedEvent
	err = tlb.LoadFromCell(&decoded, c.BeginParse())
	require.NoError(t, err)
	require.Equal(t, orig.ID, decoded.ID)
	require.Equal(t, orig.Value, decoded.Value)
}

func TestOpCodeConstants(t *testing.T) {
	// Test that the opcodes have the expected values
	require.Equal(t, uint32(0x10000004), SetCountOpCode)
	require.Equal(t, uint32(0x10000005), IncreaseCounterOpCode)
}

func TestEventTopicConstants(t *testing.T) {
	// Test that event topics are properly calculated
	require.NotZero(t, CountSetEventTopic)
	require.NotZero(t, CountIncreasedEventTopic)
	require.NotEqual(t, CountSetEventTopic, CountIncreasedEventTopic)
}
