package tlbe

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	src "github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
)

// small is a fixed-size struct (ints only, no refs) used to exercise Array
// with composite element types packed into a single chunk.
type small struct {
	A uint32 `tlb:"## 32"`
	B uint8  `tlb:"## 8"`
}

// withRef is a struct carrying a ^ ref, exercising elements whose decode consumes
// a ref from the chunk slice (like AskToTransfer does).
type withRef struct {
	Addr *address.Address `tlb:"addr"`
	N    uint16           `tlb:"## 16"`
}

func newTestAddr(seed byte) *address.Address {
	data := make([]byte, 32)
	data[0] = seed
	return address.NewAddress(0, 0, data)
}

func TestArray_RoundTripScalars(t *testing.T) {
	in := Array[uint64]{1, 2, 3}

	c, err := tlb.ToCell(in)
	require.NoError(t, err)

	var out Array[uint64]
	require.NoError(t, src.LoadFromCell(&out, c.BeginParse()))
	require.Equal(t, in, out)
}

func TestArray_RoundTripStructs(t *testing.T) {
	in := Array[small]{
		{A: 1, B: 2},
		{A: 3, B: 4},
	}

	c, err := tlb.ToCell(in)
	require.NoError(t, err)

	var out Array[small]
	require.NoError(t, src.LoadFromCell(&out, c.BeginParse()))
	require.Equal(t, in, out)
}

func TestArray_RoundTripStructsWithRefs(t *testing.T) {
	// 3 elements: exercises chunk chaining (each element's addr consumes a ref
	// from its chunk, and the drain loop must not mistake the chain ref for data).
	in := Array[withRef]{
		{Addr: newTestAddr(0x01), N: 11},
		{Addr: newTestAddr(0x02), N: 22},
		{Addr: newTestAddr(0x03), N: 33},
	}

	c, err := tlb.ToCell(in)
	require.NoError(t, err)

	var out Array[withRef]
	require.NoError(t, src.LoadFromCell(&out, c.BeginParse()))
	require.Len(t, out, len(in))
	for i := range in {
		require.True(t, in[i].Addr.Equals(out[i].Addr), "elem %d addr mismatch", i)
		require.Equal(t, in[i].N, out[i].N, "elem %d N mismatch", i)
	}
}

func TestArray_Empty(t *testing.T) {
	c, err := tlb.ToCell(Array[uint64]{})
	require.NoError(t, err)

	var out Array[uint64]
	require.NoError(t, src.LoadFromCell(&out, c.BeginParse()))
	require.Empty(t, out)
}

func TestArray_ReceiverReusable(t *testing.T) {
	in := Array[uint64]{1, 2, 3}
	c, err := tlb.ToCell(in)
	require.NoError(t, err)

	// Pre-populate the receiver; LoadFromCell must reset it, not accumulate.
	out := Array[uint64]{99, 98}
	require.NoError(t, src.LoadFromCell(&out, c.BeginParse()))
	require.Equal(t, in, out)
}

func TestArray_LengthMismatchRejected(t *testing.T) {
	// Build a deliberately corrupt array whose length prefix does not match the
	// number of elements actually present on the chain.
	b := cell.BeginCell()
	require.NoError(t, b.StoreUInt(5, 8)) // claim 5 elements
	require.NoError(t, b.StoreMaybeRef(nil))
	c := b.EndCell()

	var out Array[uint64]
	err := src.LoadFromCell(&out, c.BeginParse())
	require.Error(t, err)
	require.Contains(t, err.Error(), "mismatch")
}

func TestArray_OverLengthLimitRejected(t *testing.T) {
	in := make(Array[uint64], TolkMaxArrayLength+1)
	_, err := tlb.ToCell(in)
	require.Error(t, err)
	require.Contains(t, err.Error(), "exceeds maximum")
}

func TestArray_NilReceiver(t *testing.T) {
	var out *Array[uint64]
	err := src.LoadFromCell(out, cell.BeginCell().EndCell().BeginParse())
	require.Error(t, err)
	require.Contains(t, err.Error(), "nil")
}

func TestArray_LargeCount(t *testing.T) {
	// A multi-chunk array near the TVM limit must round-trip.
	n := 200
	in := make(Array[uint64], n)
	for i := range in {
		in[i] = uint64(i + 1)
	}
	c, err := tlb.ToCell(in)
	require.NoError(t, err)
	var out Array[uint64]
	require.NoError(t, src.LoadFromCell(&out, c.BeginParse()))
	require.Equal(t, in, out)
}

func TestArray_ErrorReferencesElement(t *testing.T) {
	// A failing element serialization (nil pointer element) must surface which
	// index failed. Elements are serialized in reverse, and the first nil is at
	// index 2, so the reported index is 2.
	bad := make(Array[*withRef], 3)
	bad[1] = &withRef{Addr: newTestAddr(0x01), N: 1}

	_, err := tlb.ToCell(bad)
	require.Error(t, err)
	require.Contains(t, err.Error(), "element 2")
}
