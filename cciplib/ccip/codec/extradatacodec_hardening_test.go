package codec

import (
	"context"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp"
)

// Off-chain hardening regressions for malformed cell classes
//
// The on-chain hardening stops new poison messages being emitted but cannot repair
// messages sequenced before it deployed, so each malformed class must produce a
// typed error at the decoder boundary — confining the failure to the affected
// lane — rather than a panic or a silent mis-read.

func bytesN(b byte, n int) []byte {
	out := make([]byte, n)
	for i := range out {
		out[i] = b
	}
	return out
}

// makeLibraryCell returns a synthetic library-reference cell: 264 bits (8-bit
// type tag 0x02 + 256-bit library hash) and no refs, marked special. TVM resolves
// this shape at CTOS; the Go bindings read the descriptor verbatim.
func makeLibraryCell(t *testing.T) *cell.Cell {
	t.Helper()
	hash := make([]byte, 32)
	for i := range hash {
		hash[i] = byte(i + 1)
	}
	c, err := cell.BeginCell().
		MustStoreUInt(0x02, 8).
		MustStoreSlice(hash, 256).
		EndCellSpecial(true)
	require.NoError(t, err)
	require.Equal(t, uint(264), c.BitsSize())
	require.Equal(t, cell.LibraryCellType, c.GetType())
	return c
}

// buildSVMExtraArgsWithAccountsRef builds an SVMExtraArgsV1 cell by hand so that
// the `accounts` ref can point at an arbitrary (here: special) cell.
func buildSVMExtraArgsWithAccountsRef(receiver []byte, accounts *cell.Cell) *cell.Cell {
	return cell.BeginCell().
		MustStoreUInt(0x1f3b3aba, 32). // CCIP SVMExtraArgsV1 tag
		MustStoreUInt(50000, 32).      // computeUnits
		MustStoreUInt(0, 64).          // accountIsWritableBitmap
		MustStoreBoolBit(false).       // allowOutOfOrderExecution
		MustStoreSlice(receiver, 256). // tokenReceiver
		MustStoreRef(accounts).
		EndCell()
}

// The framing-malformed BOCs below must produce a decode error, not a panic.

// TestPanic_zeroRootBOC_error covers roots = 0, which violates the BOC grammar
// ({ roots >= 1 }) while every other header field is valid.
func TestPanic_zeroRootBOC_error(t *testing.T) {
	// magic, no index/crc, size=1, off_bytes=1, cells=1, roots=0, absent=0, tot=2
	boc := []byte{0xB5, 0xEE, 0x9C, 0x72, 0x01, 0x01, 0x01, 0x00, 0x00, 0x02, 0x00, 0x00}

	require.NotPanics(t, func() {
		_, err := NewExtraDataDecoder().DecodeExtraArgsToMap(boc)
		require.Error(t, err)
	})
}

// TestPanic_truncatedHeaderBOC_error covers a header declaring a wider size
// descriptor (size = 4) than the bytes present, so reading the fixed header
// runs past the end of the buffer.
func TestPanic_truncatedHeaderBOC_error(t *testing.T) {
	// magic, size=4 with fewer than the declared bytes present
	boc := []byte{0xB5, 0xEE, 0x9C, 0x72, 0x04, 0x04, 0x00, 0x00, 0x00, 0x01}

	require.NotPanics(t, func() {
		_, err := NewExtraDataDecoder().DecodeExtraArgsToMap(boc)
		require.Error(t, err)
	})
}

// TestF4_libraryRefRootCell_rejected covers a library reference used as the whole
// extraArgs cell. The error must name the cell class so operators can triage it.
func TestF4_libraryRefRootCell_rejected(t *testing.T) {
	extraArgs := makeLibraryCell(t).ToBOC()
	_, err := NewExtraDataDecoder().DecodeExtraArgsToMap(extraArgs)

	require.Error(t, err)
	require.Contains(t, err.Error(), "library-reference")
}

// TestF4_libraryRefInNestedAccounts_rejected covers finding 4 variant B: the
// FeeQuoter validates the resolved contents of the SVM `accounts` snake but
// re-emits the library reference itself.
func TestF4_libraryRefInNestedAccounts_rejected(t *testing.T) {
	accounts := makeLibraryCell(t)
	extraArgs := buildSVMExtraArgsWithAccountsRef(bytesN(0xAB, 32), accounts)

	_, err := NewExtraDataDecoder().DecodeExtraArgsToMap(extraArgs.ToBOC())

	require.Error(t, err)
	require.Contains(t, err.Error(), "library-reference")
}

// TestF4_libraryRefInSuiReceiverObjectIDs_rejected is the Sui symmetry: same
// decoder, different call site.
func TestF4_libraryRefInSuiReceiverObjectIDs_rejected(t *testing.T) {
	extraArgs := cell.BeginCell().
		MustStoreUInt(0x21ea4ca9, 32).      // CCIP SuiExtraArgsV1 tag
		MustStoreUInt(50000, 256).          // gasLimit (non-optional for Sui)
		MustStoreBoolBit(true).             // allowOutOfOrderExecution
		MustStoreSlice(bytesN(0, 32), 256). // tokenReceiver
		MustStoreRef(makeLibraryCell(t)).
		EndCell()

	_, err := NewExtraDataDecoder().DecodeExtraArgsToMap(extraArgs.ToBOC())

	require.Error(t, err)
	require.Contains(t, err.Error(), "library-reference")
}

// TestF2_branchedDataCell_rejected covers finding 2: a branched cell (more than
// one continuation ref) must be reported as an invalid snake chain.
func TestF2_branchedDataCell_rejected(t *testing.T) {
	branched := cell.BeginCell().
		MustStoreSlice([]byte("payload"), 56).
		MustStoreRef(cell.BeginCell().MustStoreSlice([]byte("left"), 32).EndCell()).
		MustStoreRef(cell.BeginCell().MustStoreSlice([]byte("right"), 40).EndCell()).
		EndCell()

	var snake common.SnakeBytes
	err := snake.LoadFromCell(branched.MustBeginParse())

	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid snake chain")
}

// TestF2_partialByteCell_isPaddedOffchain pins the decoder's lenient behaviour on
// the other half of finding 2: a cell holding a partial byte is padded up to a
// whole byte, mid-chain as well as terminal. The on-chain canonical check rejects
// these shapes, so this padding is only reachable for events emitted before the
// contract fix deployed — it must stay understood rather than silently change.
func TestF2_partialByteCell_isPaddedOffchain(t *testing.T) {
	t.Run("terminal partial byte", func(t *testing.T) {
		tail := cell.BeginCell().MustStoreSlice([]byte{0xAB}, 4).EndCell()

		var snake common.SnakeBytes
		require.NoError(t, snake.LoadFromCell(tail.MustBeginParse()))
		require.Equal(t, []byte{0xA0}, []byte(snake), "partial byte is padded, not rejected")
	})

	t.Run("mid-chain partial byte", func(t *testing.T) {
		head := cell.BeginCell().
			MustStoreSlice([]byte{0xAB}, 4). // partial byte with a continuation
			MustStoreRef(cell.BeginCell().MustStoreSlice([]byte{0x00}, 8).EndCell()).
			EndCell()

		var snake common.SnakeBytes
		require.NoError(t, snake.LoadFromCell(head.MustBeginParse()))
		require.Equal(t, []byte{0xA0, 0x00}, []byte(snake), "mid-chain partial byte is padded too")
	})
}

// TestF3_splitAccountAcrossCells_rejected covers finding 3's primary case: an
// account split across a cell boundary. Aggregate bit-counting on-chain accepts
// it; a schema-aware decoder must not.
func TestF3_splitAccountAcrossCells_rejected(t *testing.T) {
	head := cell.BeginCell().
		MustStoreSlice(make([]byte, 16), 128).
		MustStoreRef(cell.BeginCell().MustStoreSlice(make([]byte, 16), 128).EndCell()).
		EndCell()

	var accounts common.SnakedCell[onramp.Account256]
	require.Error(t, accounts.LoadFromCell(head.MustBeginParse()))
}

// TestF3_truncatedCollection_rejected covers a collection whose aggregate bits
// divide into a plausible count on-chain while leaving a partial element.
func TestF3_truncatedCollection_rejected(t *testing.T) {
	tail := cell.BeginCell().
		MustStoreSlice(make([]byte, 32), 256).
		MustStoreSlice(make([]byte, 12), 96).
		EndCell()

	var accounts common.SnakedCell[onramp.Account256]
	require.Error(t, accounts.LoadFromCell(tail.MustBeginParse()))
}

// TestF3_canonicalMultiCellCollection_accepted is the control: a well-formed snake
// still decodes and still produces [][32]byte for the plugin.
func TestF3_canonicalMultiCellCollection_accepted(t *testing.T) {
	original := common.SnakedCell[onramp.Account256]{
		{Value: bytesN(0x11, 32)},
		{Value: bytesN(0x22, 32)},
	}
	c, err := original.ToCell()
	require.NoError(t, err)

	var decoded common.SnakedCell[onramp.Account256]
	require.NoError(t, decoded.LoadFromCell(c.MustBeginParse()))
	require.Equal(t, original, decoded)

	extraArgs := buildSVMExtraArgsWithAccountsRef(bytesN(0x33, 32), c).ToBOC()
	out, err := NewExtraDataDecoder().DecodeExtraArgsToMap(extraArgs)
	require.NoError(t, err)

	accounts, ok := out["accounts"].([][32]byte)
	require.True(t, ok, "expected [][32]byte, got %T", out["accounts"])
	require.Len(t, accounts, 2)
	require.Equal(t, [32]byte(bytesN(0x11, 32)), accounts[0])
	require.Equal(t, [32]byte(bytesN(0x22, 32)), accounts[1])
}

// TestF1_onlyOptionalGasLimitCanBeAbsent pins the reach of the typed-nil guard.
//
// `maybe` appears exactly once across the three extra-args types
// (GenericExtraArgsV2.GasLimit). The Sui variant's gas limit is a mandatory
// `## 256` field, so it must decode to zero rather than nil — zero is tested
// because it is the only value a decoder could mistake for absent. If a future
// binding adds `maybe` elsewhere, this test is the signal that the guard's
// scope assumption no longer holds.
func TestF1_onlyOptionalGasLimitCanBeAbsent(t *testing.T) {
	c, err := tlb.ToCell(onramp.SuiExtraArgsV1{
		GasLimit:                 new(big.Int),
		AllowOutOfOrderExecution: true,
		TokenReceiver:            bytesN(0x55, 32),
	})
	require.NoError(t, err)

	decoded, err := NewExtraDataDecoder().DecodeExtraArgsToMap(c.ToBOC())
	require.NoError(t, err)

	gl, ok := decoded["gasLimit"].(*big.Int)
	require.True(t, ok, "expected *big.Int, got %T", decoded["gasLimit"])
	require.NotNil(t, gl, "mandatory `## 256` gas limit must never decode to a typed nil")
	require.Zero(t, gl.Sign())
}

// makeMerkleUpdateCell returns a synthetic merkle-update cell: 552 bits
// (8-bit type tag 0x04 + old/new hash + old/new depth) and 2 refs.
//
// It is the shape that makes whole-tree validation necessary rather than
// root-only validation: its leading zero bit makes a `maybe` field read as
// absent, its two refs satisfy a schema's ref fields, and the remaining
// descriptor bits are never consumed — so generic TL-B decoding accepts it and
// yields a plausible-looking empty report.
//
// tonutils-go validates special cells both when building them and when parsing
// a BOC, so the embedded hashes and depths must match the refs.
func makeMerkleUpdateCell(t *testing.T) *cell.Cell {
	t.Helper()
	empty := cell.BeginCell().EndCell()

	c, err := cell.BeginCell().
		MustStoreUInt(0x04, 8).
		MustStoreSlice(empty.Hash(0), 256). // old hash
		MustStoreSlice(empty.Hash(0), 256). // new hash
		MustStoreUInt(uint64(empty.Depth(0)), 16).
		MustStoreUInt(uint64(empty.Depth(0)), 16).
		MustStoreRef(empty).
		MustStoreRef(empty).
		EndCellSpecial(true)
	require.NoError(t, err)
	require.Equal(t, uint(552), c.BitsSize())
	require.Equal(t, cell.MerkleUpdateCellType, c.GetType())
	return c
}

// TestF4_merkleUpdateRoot_rejected covers the special-cell class a root check
// alone did not catch. Before tree validation, this cell decoded through the
// commit codec into an empty report that matched no real message.
func TestF4_merkleUpdateRoot_rejected(t *testing.T) {
	boc := makeMerkleUpdateCell(t).ToBOC()

	_, err := NewCommitPluginCodecV1().Decode(context.Background(), boc)
	require.Error(t, err)
	require.Contains(t, err.Error(), "merkle-update")

	_, err = NewExecutePluginCodecV1(nil).Decode(context.Background(), boc)
	require.Error(t, err)
	require.Contains(t, err.Error(), "merkle-update")
}

// TestF4_merkleProofRoot_rejected is the same class via the other wrapper, whose
// single ref is enough for a schema expecting exactly one.
func TestF4_merkleProofRoot_rejected(t *testing.T) {
	inner := cell.BeginCell().MustStoreUInt(1, 8).EndCell()

	c, err := cell.BeginCell().
		MustStoreUInt(0x03, 8).
		MustStoreSlice(inner.Hash(0), 256).
		MustStoreUInt(uint64(inner.Depth(0)), 16).
		MustStoreRef(inner).
		EndCellSpecial(true)
	require.NoError(t, err)
	require.Equal(t, cell.MerkleProofCellType, c.GetType())

	_, err = NewCommitPluginCodecV1().Decode(context.Background(), c.ToBOC())
	require.Error(t, err)
	require.Contains(t, err.Error(), "merkle-proof")
}

// TestF4_specialCellBelowRoot_rejected covers the reason validation walks the
// whole tree: a special cell reached only through a reference is invisible to a
// root check, and any field the schema never reads could hide one.
func TestF4_specialCellBelowRoot_rejected(t *testing.T) {
	root := cell.BeginCell().
		MustStoreUInt(0x01, 8).
		MustStoreRef(makeLibraryCell(t)).
		EndCell()

	err := common.CheckOrdinaryTree(root)
	require.Error(t, err)
	require.Contains(t, err.Error(), "library-reference")
}

// TestF4_ordinaryTree_accepted keeps the walk from over-rejecting: ordinary
// cells at any depth stay valid, and an absent cell is simply skipped.
func TestF4_ordinaryTree_accepted(t *testing.T) {
	nested := cell.BeginCell().
		MustStoreUInt(0x02, 8).
		MustStoreRef(cell.BeginCell().MustStoreUInt(0x03, 8).EndCell()).
		EndCell()
	root := cell.BeginCell().MustStoreUInt(0x01, 8).MustStoreRef(nested).EndCell()

	require.NoError(t, common.CheckOrdinaryTree(root))
	require.NoError(t, common.CheckOrdinaryTree(nil))
}
