package offramp

import (
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ocr"
)

func TestCommit_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	tokenPriceSlice := []ocr.TokenPriceUpdate{
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000),
		},
		{
			SourceToken: addr,
			UsdPerToken: big.NewInt(1000000),
		},
	}
	require.NoError(t, err)

	gasPriceSlice := []ocr.GasPriceUpdate{
		{
			DestChainSelector:        1,
			ExecutionGasPrice:        big.NewInt(1000000),
			DataAvailabilityGasPrice: big.NewInt(2000000),
		},
		{
			DestChainSelector:        2,
			ExecutionGasPrice:        big.NewInt(3000000),
			DataAvailabilityGasPrice: big.NewInt(4000000),
		},
	}
	require.NoError(t, err)
	onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	merkleRoots := []ocr.MerkleRoot{
		{
			SourceChainSelector: 1,
			OnRampAddress:       onrampAddr,
			MinSeqNr:            100,
			MaxSeqNr:            200,
			MerkleRoot:          make([]byte, 32),
		},
	}
	require.NoError(t, err)

	commitReport := ocr.CommitReport{
		MerkleRoots: merkleRoots,
		PriceUpdates: &ocr.PriceUpdates{
			TokenPriceUpdates: tokenPriceSlice,
			GasPriceUpdates:   gasPriceSlice,
		},
	}

	configDigest := make([]byte, 64) // 512 bits digest
	for i := range configDigest {
		configDigest[i] = byte(i)
	}

	subSig := make([]byte, 96) // 768 bits signature
	for i := range subSig {
		subSig[i] = byte(i)
	}

	Sigs := []ocr.SignatureEd25519{
		{Data: subSig},
		{Data: subSig},
	}

	report := Commit{
		QueryID:          1,
		ConfigDigest:     configDigest,
		CommitReport:     commitReport,
		SignatureEd25519: Sigs,
	}

	// Encode to cell
	c, err := tlb.ToCell(report)
	require.NoError(t, err)

	rb := c.ToBOC()
	newCell, err := cell.FromBOC(rb)
	require.NoError(t, err)

	// Decode from cell
	var decoded Commit
	err = tlb.Parse(&decoded, newCell)
	require.NoError(t, err)
	require.Equal(t, c.Hash(), newCell.Hash())
	require.Equal(t, commitReport, decoded.CommitReport)
	require.Equal(t, report.QueryID, decoded.QueryID)
	require.Equal(t, report.ConfigDigest, decoded.ConfigDigest)
	require.Equal(t, report.SignatureEd25519, decoded.SignatureEd25519)
}

func TestExecute_EncodingAndDecoding(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	dummyCell, err := common.NewDummyCell()
	require.NoError(t, err)
	onrampAddr := common.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05}
	destGasAmount := tlb.MustFromTON("1000")
	tokenAmountsSlice := []ocr.Any2TVMTokenTransfer{
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(10),
		},
		{
			SourcePoolAddress: onrampAddr,
			DestPoolAddress:   addr,
			DestGasAmount:     &destGasAmount,
			ExtraData:         dummyCell,
			Amount:            big.NewInt(20),
		},
	}

	rampMessage := ocr.Any2TVMRampMessage{
		Header: ocr.RampMessageHeader{
			MessageID:           make([]byte, 32),
			SourceChainSelector: 1,
			DestChainSelector:   2,
			SequenceNumber:      1,
			Nonce:               0,
		},
		Sender:       onrampAddr,
		Data:         make([]byte, 1000),
		Receiver:     addr,
		GasLimit:     tlb.MustFromTON("0.0001"),
		TokenAmounts: tokenAmountsSlice,
	}

	report := ocr.ExecuteReport{
		SourceChainSelector: 1,
		Message:             rampMessage,
		OffChainTokenData:   common.LispList[common.LispList[common.SnakeBytes]]{},
		Proofs:              common.SnakedCell[common.Proof]{{Value: big.NewInt(0)}, {Value: big.NewInt(0)}},
		ProofFlagBits:       big.NewInt(0),
	}

	configDigest := make([]byte, 64) // 512 bits digest
	for i := range configDigest {
		configDigest[i] = byte(i)
	}

	execute := Execute{
		QueryID:       1,
		ConfigDigest:  configDigest,
		ExecuteReport: report,
	}

	// Encode to cell
	c, err := tlb.ToCell(execute)
	require.NoError(t, err)

	rb := c.ToBOC()
	newCell, err := cell.FromBOC(rb)
	require.NoError(t, err)

	// Decode from cell
	var decoded Execute
	err = tlb.Parse(&decoded, newCell)
	require.NoError(t, err)
	require.Equal(t, c.Hash(), newCell.Hash())
	require.Len(t, decoded.ExecuteReport.Message.TokenAmounts, 2)
	require.Len(t, decoded.ExecuteReport.Proofs, 2)
	require.Equal(t, execute.QueryID, decoded.QueryID)
	require.Equal(t, execute.ConfigDigest, decoded.ConfigDigest)
}

func TestExecuteReport_WithHardCodedTSBytes(t *testing.T) {
	// hex string from TypeScript
	hexStr := "b5ee9c724101030100820002ca00000000000000000000000000000000000000000000000000000000000000010c9f9284461c852bc09c614ab4cba0de00000000000000010000000000000000801da2d2260e0a008e22f73316ac3b1bd05a63f7f092219dadd6bf925ce90bdf14e7312d000102002a141a5fdbc891c5d4e6ad68064ae45d43146d4f9f3a0000d27b54c4"

	// Convert hex string to bytes
	bytes, err := hex.DecodeString(hexStr)
	require.NoError(t, err)

	// Parse the BOC (Bag of Cells)
	c, err := cell.FromBOC(bytes)
	require.NoError(t, err)

	// Load the message from the cell
	var rampMsg ocr.Any2TVMRampMessage
	err = tlb.Parse(&rampMsg, c)
	require.NoError(t, err)

	// Convert hex string to bytes
	hexStr = "b5ee9c724101040100af0003500c9f9284461c852b000000000000000000000000000000000000000000000000000000000000000001030302ca00000000000000000000000000000000000000000000000000000000000000010c9f9284461c852bc09c614ab4cba0de00000000000000010000000000000000801da2d2260e0a008e22f73316ac3b1bd05a63f7f092219dadd6bf925ce90bdf14e7312d000203002a141a5fdbc891c5d4e6ad68064ae45d43146d4f9f3a000074bb30ab"
	bytes, err = hex.DecodeString(hexStr)
	require.NoError(t, err)

	// Parse the BOC (Bag of Cells)
	c, err = cell.FromBOC(bytes)
	require.NoError(t, err)

	// Load the message from the cell
	var report ocr.ExecuteReport
	err = tlb.Parse(&report, c)
	require.NoError(t, err)
}

// ReceiverAccounts is a Tolk `array<address>`: `len: uint8` + `maybe ^` chain of chunks, each chunk
// being `next: maybe ^chunk` followed by packed elements. Tolk and the tonutils `array` tag pack
// several elements per chunk, while the generated TS wrappers store one element per chunk; all of
// them must decode each other's output.
func TestCCIPReceiveV2_ReceiverAccounts(t *testing.T) {
	a1 := address.MustParseAddr("EQBPABJHLy9WThhpL5UIiDIrUHWzz6Mjhq96hPP4TuMkGPsk")
	a2 := address.MustParseAddr("EQAsP6MHRFOGtFf2xcx4Kt82AAwQWGEcYsQB7v3-vGd8MR-j")

	newMsg := func(accounts []*address.Address) CCIPReceiveV2 {
		return CCIPReceiveV2{
			ExecID:       make([]byte, 24),
			QueryID:      7,
			ConfirmValue: tlb.MustFromTON("0.01"),
			Message: Any2TVMMessage{
				MessageID: make([]byte, 32),
				Sender:    common.CrossChainAddress{0x01, 0x02},
				Data:      cell.BeginCell().EndCell(),
			},
			ReceiverAccounts: accounts,
		}
	}
	// rawBody builds a CCIPReceiveV2 body by hand with the given receiverAccounts length and head chunk.
	rawBody := func(t *testing.T, length uint64, head *cell.Cell) *cell.Cell {
		msgCell, err := tlb.ToCell(newMsg(nil).Message)
		require.NoError(t, err)
		return cell.BeginCell().
			MustStoreUInt(0x5b4bc7a6, 32).
			MustStoreSlice(make([]byte, 24), 192).
			MustStoreUInt(7, 64).
			MustStoreBigCoins(tlb.MustFromTON("0.01").Nano()).
			MustStoreRef(msgCell).
			MustStoreUInt(length, 8).
			MustStoreMaybeRef(head).
			EndCell()
	}
	// skipToReceiverAccounts returns a slice positioned at the receiverAccounts field.
	skipToReceiverAccounts := func(t *testing.T, c *cell.Cell) *cell.Slice {
		s := c.MustBeginParse()
		s.MustLoadUInt(32)         // opcode
		s.MustLoadSlice(192)       // execID
		s.MustLoadUInt(64)         // queryId
		_, err := s.LoadBigCoins() // confirmValue
		require.NoError(t, err)
		s.MustLoadRef() // message
		return s
	}

	t.Run("round trip", func(t *testing.T) {
		for _, accounts := range [][]*address.Address{{}, {a1}, {a1, a2}} {
			c, err := tlb.ToCell(newMsg(accounts))
			require.NoError(t, err)

			var decoded CCIPReceiveV2
			require.NoError(t, tlb.LoadFromCell(&decoded, c.MustBeginParse()))
			require.Len(t, decoded.ReceiverAccounts, len(accounts))
			for i := range accounts {
				require.True(t, accounts[i].Equals(decoded.ReceiverAccounts[i]))
			}
			require.Equal(t, uint64(7), decoded.QueryID)
		}
	})

	t.Run("empty array is len 0 with no chunk", func(t *testing.T) {
		c, err := tlb.ToCell(newMsg(nil))
		require.NoError(t, err)

		s := skipToReceiverAccounts(t, c)
		require.Equal(t, uint64(0), s.MustLoadUInt(8))
		require.Nil(t, s.MustLoadMaybeRef())
		require.Zero(t, s.BitsLeft())
		require.Zero(t, s.RefsNum())
	})

	t.Run("encodes in Tolk layout", func(t *testing.T) {
		c, err := tlb.ToCell(newMsg([]*address.Address{a1, a2}))
		require.NoError(t, err)

		// Decode by hand, accepting any chunking, as Tolk and the TS wrappers do.
		s := skipToReceiverAccounts(t, c)
		length := s.MustLoadUInt(8)
		var got []*address.Address
		for chunk := s.MustLoadMaybeRef(); chunk != nil; {
			next := chunk.MustLoadMaybeRef()
			for chunk.BitsLeft() > 0 {
				got = append(got, chunk.MustLoadAddr())
			}
			chunk = next
		}
		require.Equal(t, uint64(2), length)
		require.Len(t, got, 2)
		require.True(t, a1.Equals(got[0]))
		require.True(t, a2.Equals(got[1]))
	})

	t.Run("decodes one element per chunk (TS wrapper layout)", func(t *testing.T) {
		// Mirrors storeArrayOf in the generated TS wrappers.
		tail := cell.BeginCell().MustStoreMaybeRef(nil).MustStoreAddr(a2).EndCell()
		head := cell.BeginCell().MustStoreMaybeRef(tail).MustStoreAddr(a1).EndCell()

		var decoded CCIPReceiveV2
		require.NoError(t, tlb.LoadFromCell(&decoded, rawBody(t, 2, head).MustBeginParse()))
		require.Len(t, decoded.ReceiverAccounts, 2)
		require.True(t, a1.Equals(decoded.ReceiverAccounts[0]))
		require.True(t, a2.Equals(decoded.ReceiverAccounts[1]))
	})

	t.Run("rejects length mismatch", func(t *testing.T) {
		chunk := cell.BeginCell().MustStoreMaybeRef(nil).MustStoreAddr(a1).EndCell()

		var decoded CCIPReceiveV2
		require.Error(t, tlb.LoadFromCell(&decoded, rawBody(t, 2, chunk).MustBeginParse()))
	})
}
