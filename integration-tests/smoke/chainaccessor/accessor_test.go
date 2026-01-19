package smoke

import (
	"context"
	"encoding/hex"
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	lptypes "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
	postgresstore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/postgres"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"

	logpoller_testdata "github.com/smartcontractkit/chainlink-ton/integration-tests/logpoller/testdata"
	pgtest "github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/postgres"
)

const (
	ChainSelEVMTest90000001 = 909606746561742123
	ChainSelTON             = 13879075125137744094

	// Test addresses
	TestFeeTokenAddr = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99"
	MockOffRampAddr  = "EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF"
)

// BOC (Bag of Cells) data captured from TypeScript tests.
//
// IMPORTANT: These BOCs are captured from contracts/tests/ccip/CCIPRouter.spec.ts
// If those tests break, it means either:
// - The transaction schema in the smart contracts has changed
// - The Go bindings structure has changed
//
// When either happens, you need to:
// 1. Fix the TypeScript tests first
// 2. Re-capture the BOC hexes from the test output
// 3. Update the BOC strings in this file

var (
	// CCIPMessageSent BOCs from TypeScript tests
	CCIPMessageSentSeq1BOC = "b5ee9c724101040100de0001dbec712336f3d9bad60787cb41bdd4fa6f167b1d57ee6c73c633be9902249b27d0c09c614ab4cba0de0c9f9284461c852b000000000000000100000000000000008008d0d4580cd8f09522be7c0390a7a632bda4a99291c435b767c95367ebe78e9ae00000000000000000000000100104838000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100203030300422012345678901234567890123456789012345678901234567890123456789012340000a04bb835"
	CCIPMessageSentSeq2BOC = "b5ee9c724101040100de0001db56bd19cb412a95dca040f874a6389700c33b81d192bd5cd64292c3791742f3d0c09c614ab4cba0de0c9f9284461c852b000000000000000200000000000000008008d0d4580cd8f09522be7c0390a7a632bda4a99291c435b767c95367ebe78e9ae000000000000000000000001001048380000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001002030303004220abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890000060ebc76d"
	CCIPMessageSentSeq3BOC = "b5ee9c724101040100de0001db5f4159ce2bcb67087cefd5ab9156077d0021f0170cc6f0032c0cdd76ac0e7c4ac09c614ab4cba0de0c9f9284461c852b000000000000000300000000000000008008d0d4580cd8f09522be7c0390a7a632bda4a99291c435b767c95367ebe78e9ae000000000000000000000001001048380000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001002030303004220fedcba0987654321fedcba0987654321fedcba0987654321fedcba098765432100005a837d0d"

	CCIPMessageSentBOCs = []struct {
		Name      string
		BOCHex    string
		SeqNum    uint64
		DestChain uint64
	}{
		{
			Name:      "message_seq_1",
			BOCHex:    CCIPMessageSentSeq1BOC,
			SeqNum:    1,
			DestChain: ChainSelEVMTest90000001,
		},
		{
			Name:      "message_seq_2",
			BOCHex:    CCIPMessageSentSeq2BOC,
			SeqNum:    2,
			DestChain: ChainSelEVMTest90000001,
		},
		{
			Name:      "message_seq_3",
			BOCHex:    CCIPMessageSentSeq3BOC,
			SeqNum:    3,
			DestChain: ChainSelEVMTest90000001,
		},
	}

	// CommitReportAccepted BOCs from TypeScript tests
	CommitReportAcceptedMerkleRootOnlyBOC = "b5ee9c7241010101005000009b864fc942230e42958a088888e448e2ea7356b40325722ea18a36a7cf9d00000000000000008000000000000000df513addb30a7c281b29b5e33872a05e3a408c74829bdc220e4a83397ba303eaa06e51f72f"
	CommitReportAcceptedPriceOnlyBOC      = "b5ee9c7241010401006e000101600102000203007b80186c5b823fab63015c89fcbba3a5f7da0f33a4d86ab8550295cefee69c53a674a00000000000000000000000000000000000000000000000000000003000480c9f9284461c852b00000000000000000000000000010000000000000000000000000001e97333c0"
	CommitReportAcceptedBothBOC           = "b5ee9c724101040100bb00019b864fc942230e42958a088888e448e2ea7356b40325722ea18a36a7cf9d000000000000000080000000000000009cb293328e30ade20be171db6e64f9c523767f882382cef1764b29b8aac8a773600102000203007b8017722f7ada93dc8cab8b5b89e26588a305fff7f3106a514264f3f7c458c9bd5f400000000000000000000000000000000000000000000000000000003000480c9f9284461c852b00000000000000000000000000010000000000000000000000000001ec76defc"

	// ExecutionStateChanged BOCs from TypeScript tests
	ExecutionStateChangedInProgressBOC = "b5ee9c724101010100330000620c9f9284461c852b00000000000000010000000000000000000000000000000000000000000000000000000000000001016423df08"
	ExecutionStateChangedSuccessBOC    = "b5ee9c724101010100330000620c9f9284461c852b000000000000000100000000000000000000000000000000000000000000000000000000000000010290d08f1b"
	ExecutionStateChangedFailureBOC    = "b5ee9c724101010100330000620c9f9284461c852b00000000000000010000000000000000000000000000000000000000000000000000000000000001039353e4e9"
)

func Test_TonAccessorMessageSentEventQueries(t *testing.T) {
	// Basic parsing test using the first BOC
	messageSentBocHex := CCIPMessageSentSeq1BOC
	messageSentBocBytes, err := hex.DecodeString(messageSentBocHex)
	require.NoError(t, err, "failed to decode hex string")
	messageSentCell, err := cell.FromBOC(messageSentBocBytes)
	require.NoError(t, err, "failed to parse BOC from hex")

	skipMagic := true // logpoller skips the opcode
	var messageSent onramp.CCIPMessageSent
	err = tlb.LoadFromCell(&messageSent, messageSentCell.BeginParse(), skipMagic)
	require.NoError(t, err, "failed to decode CCIPMessageSent from BOC")

	// Validate expected values from the TypeScript test
	require.Equal(t, uint64(ChainSelTON), messageSent.Message.Header.SourceChainSelector)
	require.Equal(t, uint64(ChainSelEVMTest90000001), messageSent.Message.Header.DestChainSelector)
	require.Equal(t, uint64(1), messageSent.Message.Header.SequenceNumber)
	require.Equal(t, uint64(0), messageSent.Message.Header.Nonce)
	require.NotNil(t, messageSent.Message.Sender)
	require.NotNil(t, messageSent.Message.Body.FeeToken)
	require.Equal(t, TestFeeTokenAddr, messageSent.Message.Body.FeeToken.String())
	require.NotNil(t, messageSent.Message.Body.FeeTokenAmount)
}

func Test_TonAccessor_MsgsBetweenSeqNums(t *testing.T) {
	// Basic parsing test for all BOCs
	t.Run("basic_parsing", func(t *testing.T) {
		for _, tc := range CCIPMessageSentBOCs {
			t.Run(tc.Name, func(t *testing.T) {
				bocBytes, err := hex.DecodeString(tc.BOCHex)
				require.NoError(t, err)
				bocCell, err := cell.FromBOC(bocBytes)
				require.NoError(t, err)

				var messageSent onramp.CCIPMessageSent
				err = tlb.LoadFromCell(&messageSent, bocCell.BeginParse(), true)
				require.NoError(t, err)

				require.Equal(t, tc.SeqNum, messageSent.Message.Header.SequenceNumber)
				require.Equal(t, tc.DestChain, messageSent.Message.Header.DestChainSelector)
				require.Equal(t, uint64(ChainSelTON), messageSent.Message.Header.SourceChainSelector)
				require.NotNil(t, messageSent.Message.Body.FeeToken)
				require.Equal(t, TestFeeTokenAddr, messageSent.Message.Body.FeeToken.String())
			})
		}
	})
}

func Test_TonAccessorCommitEventQueries(t *testing.T) {
	// Note: we don't test the API client interaction here, so we return empty client
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return nil, nil
	}

	// BOC data from OffRamp TypeScript tests
	merkleRootOnlyBocBytes, err := hex.DecodeString(CommitReportAcceptedMerkleRootOnlyBOC)
	require.NoError(t, err, "failed to decode hex string")
	merkleRootOnlyCell, err := cell.FromBOC(merkleRootOnlyBocBytes)
	require.NoError(t, err, "failed to parse BOC from hex")

	priceOnlyBocBytes, err := hex.DecodeString(CommitReportAcceptedPriceOnlyBOC)
	require.NoError(t, err, "failed to decode hex string")
	priceOnlyCell, err := cell.FromBOC(priceOnlyBocBytes)
	require.NoError(t, err, "failed to parse BOC from hex")

	bothBocBytes, err := hex.DecodeString(CommitReportAcceptedBothBOC)
	require.NoError(t, err, "failed to decode hex string")
	bothCell, err := cell.FromBOC(bothBocBytes)
	require.NoError(t, err, "failed to parse BOC from hex")

	t.Run("Analyze BOC structure - MerkleRoot detection", func(t *testing.T) {
		// Examine cell data to understand 'maybe' encoding pattern
		t.Logf("=== MerkleRoot Only BOC Analysis ===")
		merkleParser := merkleRootOnlyCell.BeginParse()
		t.Logf("BOC Hex: %s", CommitReportAcceptedMerkleRootOnlyBOC)
		t.Logf("Cell bits remaining: %d", merkleParser.BitsLeft())

		// Read first bit to check 'maybe' for MerkleRoot
		if merkleParser.BitsLeft() > 0 {
			firstBit := merkleParser.MustLoadBoolBit()
			t.Logf("First bit (MerkleRoot maybe): %t", firstBit)

			if firstBit {
				t.Log("MerkleRoot is present")
			} else {
				t.Log("MerkleRoot is absent")
			}
		}

		t.Logf("=== Price Updates Only BOC Analysis ===")
		priceParser := priceOnlyCell.BeginParse()
		t.Logf("BOC Hex: %s", CommitReportAcceptedPriceOnlyBOC)
		t.Logf("Cell bits remaining: %d", priceParser.BitsLeft())

		// Read first bit to check 'maybe' for MerkleRoot
		if priceParser.BitsLeft() > 0 {
			firstBit := priceParser.MustLoadBoolBit()
			t.Logf("First bit (MerkleRoot maybe): %t", firstBit)

			if firstBit {
				t.Log("MerkleRoot is present")
			} else {
				t.Log("MerkleRoot is absent")
			}
		}

		t.Logf("=== Both MerkleRoot AND PriceUpdates BOC Analysis ===")
		bothParser := bothCell.BeginParse()
		t.Logf("BOC Hex: %s", CommitReportAcceptedBothBOC)
		t.Logf("Cell bits remaining: %d", bothParser.BitsLeft())

		// Read first bit to check 'maybe' for MerkleRoot
		if bothParser.BitsLeft() > 0 {
			firstBit := bothParser.MustLoadBoolBit()
			t.Logf("First bit (MerkleRoot maybe): %t", firstBit)

			if firstBit {
				t.Log("MerkleRoot is present")
			} else {
				t.Log("MerkleRoot is absent")
			}
		}
	})

	t.Run("Test BOC decoding - Merkle Root only", func(t *testing.T) {
		// Decode using Go bindings
		var commitReportAccepted offramp.CommitReportAccepted
		err = tlb.LoadFromCell(&commitReportAccepted, merkleRootOnlyCell.BeginParse())
		require.NoError(t, err, "failed to decode CommitReportAccepted from BOC")

		// Validate the decoded data
		t.Logf("Successfully decoded CommitReportAccepted with MerkleRoot:")

		require.NotNil(t, commitReportAccepted.MerkleRoot, "MerkleRoot should be present")
		t.Logf("  MerkleRoot:")
		t.Logf("    SourceChainSelector: %d", commitReportAccepted.MerkleRoot.SourceChainSelector)
		t.Logf("    MinSeqNr: %d", commitReportAccepted.MerkleRoot.MinSeqNr)
		t.Logf("    MaxSeqNr: %d", commitReportAccepted.MerkleRoot.MaxSeqNr)
		t.Logf("    OnRampAddress: %x", commitReportAccepted.MerkleRoot.OnRampAddress)
		t.Logf("    MerkleRoot: %x", commitReportAccepted.MerkleRoot.MerkleRoot)

		// Validate expected values from the TypeScript test
		require.Equal(t, uint64(909606746561742123), commitReportAccepted.MerkleRoot.SourceChainSelector, "Source chain selector should match EVM test chain")
		require.Equal(t, uint64(1), commitReportAccepted.MerkleRoot.MinSeqNr, "MinSeqNr should be 1")
		require.Equal(t, uint64(1), commitReportAccepted.MerkleRoot.MaxSeqNr, "MaxSeqNr should be 1")
	})

	t.Run("Test BOC decoding - Price Updates only", func(t *testing.T) {
		// Decode using Go bindings
		var commitReportAccepted offramp.CommitReportAccepted
		err = tlb.LoadFromCell(&commitReportAccepted, priceOnlyCell.BeginParse())
		require.NoError(t, err, "failed to decode CommitReportAccepted from BOC")

		// Validate the decoded data
		t.Logf("Successfully decoded CommitReportAccepted with PriceUpdates:")

		require.Nil(t, commitReportAccepted.MerkleRoot, "MerkleRoot should be nil for this test")

		require.NotNil(t, commitReportAccepted.PriceUpdates, "PriceUpdates should be present")
		t.Logf("  PriceUpdates:")

		// Validate TokenPriceUpdates
		require.NotNil(t, commitReportAccepted.PriceUpdates.TokenPriceUpdates, "TokenPriceUpdates should not be nil")
		require.Len(t, commitReportAccepted.PriceUpdates.TokenPriceUpdates, 1, "Should have exactly 1 token price update")

		tokenUpdate := commitReportAccepted.PriceUpdates.TokenPriceUpdates[0]
		t.Logf("    TokenPriceUpdate[0]:")
		t.Logf("      SourceToken: %s", tokenUpdate.SourceToken.String())
		t.Logf("      UsdPerToken: %s", tokenUpdate.UsdPerToken.String())

		// Validate expected values from the TypeScript test
		require.Equal(t, "EQDDYtwR_VsYCuRP5d0dL77QeZ0mw1XCqBSud_c04p0zpcYO", tokenUpdate.SourceToken.String(), "SourceToken should match expected address")
		require.Equal(t, big.NewInt(1), tokenUpdate.UsdPerToken, "UsdPerToken should be 1")

		// Validate GasPriceUpdates
		require.NotNil(t, commitReportAccepted.PriceUpdates.GasPriceUpdates, "GasPriceUpdates should not be nil")
		require.Len(t, commitReportAccepted.PriceUpdates.GasPriceUpdates, 1, "Should have exactly 1 gas price update")

		gasUpdate := commitReportAccepted.PriceUpdates.GasPriceUpdates[0]
		t.Logf("    GasPriceUpdate[0]:")
		t.Logf("      DestChainSelector: %d", gasUpdate.DestChainSelector)
		t.Logf("      ExecutionGasPrice: %s", gasUpdate.ExecutionGasPrice.String())
		t.Logf("      DataAvailabilityGasPrice: %s", gasUpdate.DataAvailabilityGasPrice.String())

		// Validate expected values from the TypeScript test
		require.Equal(t, uint64(909606746561742123), gasUpdate.DestChainSelector, "DestChainSelector should match EVM test chain")
		// The expected packed value is 5192296858534827628530496329220097
		// This should unpack to:
		// - ExecutionGasPrice (lower 112 bits): 1
		// - DataAvailabilityGasPrice (upper 112 bits): 1
		require.Equal(t, big.NewInt(1), gasUpdate.ExecutionGasPrice, "ExecutionGasPrice should match expected value")
		require.Equal(t, big.NewInt(1), gasUpdate.DataAvailabilityGasPrice, "DataAvailabilityGasPrice should match expected value")
	})

	t.Run("Test BOC decoding - Both MerkleRoot and PriceUpdates", func(t *testing.T) {
		// Decode using Go bindings
		var commitReportAccepted offramp.CommitReportAccepted
		err = tlb.LoadFromCell(&commitReportAccepted, bothCell.BeginParse())
		require.NoError(t, err, "failed to decode CommitReportAccepted from BOC")

		// Validate the decoded data
		t.Logf("Successfully decoded CommitReportAccepted with both MerkleRoot and PriceUpdates:")

		// Validate MerkleRoot is present
		require.NotNil(t, commitReportAccepted.MerkleRoot, "MerkleRoot should be present")
		t.Logf("  MerkleRoot:")
		t.Logf("    SourceChainSelector: %d", commitReportAccepted.MerkleRoot.SourceChainSelector)
		t.Logf("    MinSeqNr: %d", commitReportAccepted.MerkleRoot.MinSeqNr)
		t.Logf("    MaxSeqNr: %d", commitReportAccepted.MerkleRoot.MaxSeqNr)
		t.Logf("    OnRampAddress: %x", commitReportAccepted.MerkleRoot.OnRampAddress)
		t.Logf("    MerkleRoot: %x", commitReportAccepted.MerkleRoot.MerkleRoot)

		// Validate expected values from the TypeScript test
		require.Equal(t, uint64(909606746561742123), commitReportAccepted.MerkleRoot.SourceChainSelector, "Source chain selector should match EVM test chain")
		require.Equal(t, uint64(1), commitReportAccepted.MerkleRoot.MinSeqNr, "MinSeqNr should be 1")
		require.Equal(t, uint64(1), commitReportAccepted.MerkleRoot.MaxSeqNr, "MaxSeqNr should be 1")

		// Validate PriceUpdates are present
		require.NotNil(t, commitReportAccepted.PriceUpdates, "PriceUpdates should be present")
		t.Logf("  PriceUpdates:")

		// Validate TokenPriceUpdates
		require.NotNil(t, commitReportAccepted.PriceUpdates.TokenPriceUpdates, "TokenPriceUpdates should not be nil")
		require.Len(t, commitReportAccepted.PriceUpdates.TokenPriceUpdates, 1, "Should have exactly 1 token price update")

		tokenUpdate := commitReportAccepted.PriceUpdates.TokenPriceUpdates[0]
		t.Logf("    TokenPriceUpdate[0]:")
		t.Logf("      SourceToken: %s", tokenUpdate.SourceToken.String())
		t.Logf("      UsdPerToken: %s", tokenUpdate.UsdPerToken.String())

		// Validate expected values from the TypeScript test
		require.Equal(t, big.NewInt(1), tokenUpdate.UsdPerToken, "UsdPerToken should be 1")

		// Validate GasPriceUpdates
		require.NotNil(t, commitReportAccepted.PriceUpdates.GasPriceUpdates, "GasPriceUpdates should not be nil")
		require.Len(t, commitReportAccepted.PriceUpdates.GasPriceUpdates, 1, "Should have exactly 1 gas price update")

		gasUpdate := commitReportAccepted.PriceUpdates.GasPriceUpdates[0]
		t.Logf("    GasPriceUpdate[0]:")
		t.Logf("      DestChainSelector: %d", gasUpdate.DestChainSelector)
		t.Logf("      ExecutionGasPrice: %s", gasUpdate.ExecutionGasPrice.String())
		t.Logf("      DataAvailabilityGasPrice: %s", gasUpdate.DataAvailabilityGasPrice.String())

		// Validate expected values from the TypeScript test
		require.Equal(t, uint64(909606746561742123), gasUpdate.DestChainSelector, "DestChainSelector should match EVM test chain")
	})

	t.Run("Ton Accessor - CommitReportsGTETimestamp - MerkleRoot filtering with mixed reports and limit", func(t *testing.T) {
		lggr := logger.Test(t)
		opts := &logpoller.ServiceOptions{
			Config:      logpoller.DefaultConfigSet,
			FilterStore: inmemorystore.NewFilterStore("test-chain", lggr),
			LogStore:    inmemorystore.NewLogStore("test-chain", lggr),
		}

		lp, err := logpoller.NewService(
			lggr,
			"test-chain",
			clientProvider,
			opts,
		)
		require.NoError(t, err)

		// Run test with in-memory store (filterID = 1 for in-memory)
		testCommitReportsMixedHelper(t, lp, opts.LogStore, 1, merkleRootOnlyCell, priceOnlyCell, bothCell)
	})

	t.Run("Ton Accessor - CommitReportsGTETimestamp - Basic functionality", func(t *testing.T) {
		lggr := logger.Test(t)
		opts := &logpoller.ServiceOptions{
			Config:      logpoller.DefaultConfigSet,
			FilterStore: inmemorystore.NewFilterStore("test-chain", lggr),
			LogStore:    inmemorystore.NewLogStore("test-chain", lggr),
		}

		lp, err := logpoller.NewService(
			lggr,
			"test-chain",
			clientProvider,
			opts,
		)
		require.NoError(t, err)

		// Run test with in-memory store (filterID = 1 for in-memory)
		testCommitReportsBasicHelper(t, lp, opts.LogStore, 1, merkleRootOnlyCell)
	})

	t.Run("Ton Accessor - CommitReportsGTETimestamp - WithPostgresStore - Mixed reports", func(t *testing.T) {
		if testing.Short() {
			t.Skip("Skipping postgres test in short mode")
		}

		lggr := logger.Test(t)
		ds := pgtest.SetupTestDB(t)

		err := pgtest.ExecuteSQL(t.Context(), ds, logpoller_testdata.CreateLogPollerTables)
		require.NoError(t, err, "failed to create TON tables")

		orm := postgresstore.NewORM("test-chain", ds, lggr)
		opts := &logpoller.ServiceOptions{
			Config:      logpoller.DefaultConfigSet,
			FilterStore: postgresstore.NewFilterStore("test-chain", orm, lggr),
			LogStore:    postgresstore.NewLogStore("test-chain", orm, lggr),
		}

		lp, err := logpoller.NewService(
			lggr,
			"test-chain",
			clientProvider,
			opts,
		)
		require.NoError(t, err)

		// Register filter first (required for foreign key constraint)
		filter := lptypes.Filter{
			Name:     "CommitReportAccepted_Filter",
			Address:  address.MustParseAddr(MockOffRampAddr),
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: hash.CRC32(consts.EventNameCommitReportAccepted),
		}
		filterID, err := lp.RegisterFilter(t.Context(), filter)
		require.NoError(t, err, "failed to register filter")

		// Run test with postgres store
		testCommitReportsMixedHelper(t, lp, opts.LogStore, filterID, merkleRootOnlyCell, priceOnlyCell, bothCell)
	})

	t.Run("Ton Accessor - CommitReportsGTETimestamp - WithPostgresStore - Basic", func(t *testing.T) {
		if testing.Short() {
			t.Skip("Skipping postgres test in short mode")
		}

		lggr := logger.Test(t)
		ds := pgtest.SetupTestDB(t)

		err := pgtest.ExecuteSQL(t.Context(), ds, logpoller_testdata.CreateLogPollerTables)
		require.NoError(t, err, "failed to create TON tables")

		orm := postgresstore.NewORM("test-chain", ds, lggr)
		opts := &logpoller.ServiceOptions{
			Config:      logpoller.DefaultConfigSet,
			FilterStore: postgresstore.NewFilterStore("test-chain", orm, lggr),
			LogStore:    postgresstore.NewLogStore("test-chain", orm, lggr),
		}

		lp, err := logpoller.NewService(
			lggr,
			"test-chain",
			clientProvider,
			opts,
		)
		require.NoError(t, err)

		// Register filter first (required for foreign key constraint)
		filter := lptypes.Filter{
			Name:     "CommitReportAccepted_Filter",
			Address:  address.MustParseAddr(MockOffRampAddr),
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: hash.CRC32(consts.EventNameCommitReportAccepted),
		}
		filterID, err := lp.RegisterFilter(t.Context(), filter)
		require.NoError(t, err, "failed to register filter")

		// Run test with postgres store
		testCommitReportsBasicHelper(t, lp, opts.LogStore, filterID, merkleRootOnlyCell)
	})
}

// testCommitReportsMixedHelper tests CommitReportsGTETimestamp with mixed MerkleRoot and PriceUpdates logs.
func testCommitReportsMixedHelper(t *testing.T, lp logpoller.Service, logStore logpoller.LogStore, filterID int64, merkleRootOnlyCell, priceOnlyCell, bothCell *cell.Cell) {
	t.Helper()

	// Set timestamp before saving the logs
	baseTimestamp := time.Now()
	queryTimestamp := baseTimestamp.Add(-1 * time.Minute)

	// Save MIXED logs in chronological order to test filtering and limit functionality
	savedCount, serr := logStore.SaveLogs(t.Context(), []lptypes.Log{
		// 1. MerkleRoot-only log (should be included)
		{
			ChainID:      "test-chain",
			FilterID:     filterID,
			Address:      address.MustParseAddr(MockOffRampAddr),
			EventSig:     hash.CRC32(consts.EventNameCommitReportAccepted),
			Data:         merkleRootOnlyCell,
			TxHash:       lptypes.TxHash{1, 2, 3, 4, 5},
			TxLT:         1000,
			TxTimestamp:  baseTimestamp.Add(1 * time.Second),
			Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 100},
			MCBlockSeqno: 200,
			MsgIndex:     0,
		},
		// 2. PriceUpdates-only log (should be filtered OUT)
		{
			ChainID:      "test-chain",
			FilterID:     filterID,
			Address:      address.MustParseAddr(MockOffRampAddr),
			EventSig:     hash.CRC32(consts.EventNameCommitReportAccepted),
			Data:         priceOnlyCell,
			TxHash:       lptypes.TxHash{2, 3, 4, 5, 6},
			TxLT:         1001,
			TxTimestamp:  baseTimestamp.Add(2 * time.Second),
			Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 101},
			MCBlockSeqno: 201,
			MsgIndex:     1,
		},
		// 3. Both MerkleRoot AND PriceUpdates (should be included)
		{
			ChainID:      "test-chain",
			FilterID:     filterID,
			Address:      address.MustParseAddr(MockOffRampAddr),
			EventSig:     hash.CRC32(consts.EventNameCommitReportAccepted),
			Data:         bothCell,
			TxHash:       lptypes.TxHash{3, 4, 5, 6, 7},
			TxLT:         1002,
			TxTimestamp:  baseTimestamp.Add(3 * time.Second),
			Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 102},
			MCBlockSeqno: 202,
			MsgIndex:     2,
		},
		// 4. Another PriceUpdates-only log (should be filtered OUT)
		{
			ChainID:      "test-chain",
			FilterID:     filterID,
			Address:      address.MustParseAddr(MockOffRampAddr),
			EventSig:     hash.CRC32(consts.EventNameCommitReportAccepted),
			Data:         priceOnlyCell,
			TxHash:       lptypes.TxHash{4, 5, 6, 7, 8},
			TxLT:         1003,
			TxTimestamp:  baseTimestamp.Add(4 * time.Second),
			Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 103},
			MCBlockSeqno: 203,
			MsgIndex:     3,
		},
		// 5. Another MerkleRoot-only log (should be included)
		{
			ChainID:      "test-chain",
			FilterID:     filterID,
			Address:      address.MustParseAddr(MockOffRampAddr),
			EventSig:     hash.CRC32(consts.EventNameCommitReportAccepted),
			Data:         merkleRootOnlyCell,
			TxHash:       lptypes.TxHash{5, 6, 7, 8, 9},
			TxLT:         1004,
			TxTimestamp:  baseTimestamp.Add(5 * time.Second),
			Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 104},
			MCBlockSeqno: 204,
			MsgIndex:     4,
		},
	}, logpoller.DefaultConfigSet.BatchInsertSize, logpoller.DefaultConfigSet.MinBatchSize)
	require.NoError(t, serr, "failed to save logs")
	require.Equal(t, int64(5), savedCount, "should have saved 5 logs")

	// Setup accessor
	addrCodec := codec.NewAddressCodec()
	accessor, aerr := chainaccessor.NewTONAccessor(logger.Test(t), ccipocr3.ChainSelector(ChainSelTON), nil, lp, addrCodec)
	require.NoError(t, aerr)

	rawMockOffRampAddr, err := addrCodec.AddressStringToBytes(MockOffRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(t.Context(), consts.ContractNameOffRamp, rawMockOffRampAddr)
	require.NoError(t, err)

	// Test 1: Query with high limit - should return all 3 MerkleRoot reports
	reports, err := accessor.CommitReportsGTETimestamp(t.Context(), queryTimestamp, primitives.Finalized, 10)
	require.NoError(t, err, "failed to get commit reports")
	require.Len(t, reports, 3, "Should return exactly 3 reports with MerkleRoot, filtering out PriceUpdates-only logs")

	// Validate all returned reports have MerkleRoot
	for i, report := range reports {
		require.NotEmpty(t, report.Report.BlessedMerkleRoots, "Report %d should have at least 1 blessed merkle root", i+1)
	}

	// Test 2: Query with limit=2 - should return only first 2 MerkleRoot reports
	limitedReports, err := accessor.CommitReportsGTETimestamp(t.Context(), queryTimestamp, primitives.Finalized, 2)
	require.NoError(t, err, "failed to get limited commit reports")
	require.Len(t, limitedReports, 2, "Should return exactly 2 reports due to limit=2")

	// Validate the limited reports are the first 2 chronologically (with MerkleRoot)
	for i, report := range limitedReports {
		require.NotEmpty(t, report.Report.BlessedMerkleRoots, "Limited report %d should have at least 1 blessed merkle root", i+1)
	}

	// Test 3: Query with limit=1 - should return only the first MerkleRoot report
	singleReport, err := accessor.CommitReportsGTETimestamp(t.Context(), queryTimestamp, primitives.Finalized, 1)
	require.NoError(t, err, "failed to get single commit report")
	require.Len(t, singleReport, 1, "Should return exactly 1 report due to limit=1")
	require.NotEmpty(t, singleReport[0].Report.BlessedMerkleRoots, "Single report should have at least 1 blessed merkle root")

	// Validate chronological ordering (reports should be ordered by timestamp ASC)
	for i := 1; i < len(reports); i++ {
		require.True(t, reports[i-1].Timestamp.Before(reports[i].Timestamp) || reports[i-1].Timestamp.Equal(reports[i].Timestamp),
			"Reports should be in chronological order (ASC)")
	}
}

// testCommitReportsBasicHelper tests CommitReportsGTETimestamp basic functionality.
func testCommitReportsBasicHelper(t *testing.T, lp logpoller.Service, logStore logpoller.LogStore, filterID int64, merkleRootOnlyCell *cell.Cell) {
	t.Helper()

	// Set timestamp before saving the log
	logTimestamp := time.Now()
	queryTimestamp := logTimestamp.Add(-1 * time.Minute)

	// Save log
	savedCount, saveErr := logStore.SaveLogs(t.Context(), []lptypes.Log{{
		ChainID:      "test-chain",
		FilterID:     filterID,
		Address:      address.MustParseAddr(MockOffRampAddr),
		EventSig:     hash.CRC32(consts.EventNameCommitReportAccepted),
		Data:         merkleRootOnlyCell,
		TxHash:       lptypes.TxHash{1, 2, 3, 4, 5},
		TxLT:         1000,
		TxTimestamp:  logTimestamp,
		Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 100},
		MCBlockSeqno: 200,
		MsgIndex:     0,
	}}, logpoller.DefaultConfigSet.BatchInsertSize, logpoller.DefaultConfigSet.MinBatchSize)
	require.NoError(t, saveErr, "failed to save logs")
	require.Equal(t, int64(1), savedCount, "should have saved 1 log")

	// Query report via ton accessor
	addrCodec := codec.NewAddressCodec()
	accessor, aerr := chainaccessor.NewTONAccessor(logger.Test(t), ccipocr3.ChainSelector(ChainSelTON), nil, lp, addrCodec)
	require.NoError(t, aerr)

	rawMockOffRampAddr, err := addrCodec.AddressStringToBytes(MockOffRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(t.Context(), consts.ContractNameOffRamp, rawMockOffRampAddr)
	require.NoError(t, err)

	reports, err := accessor.CommitReportsGTETimestamp(t.Context(), queryTimestamp, primitives.Finalized, 1)
	require.NoError(t, err, "failed to get commit reports")
	require.Len(t, reports, 1, "expected 1 commit report")

	// Validate the returned report
	report := reports[0]
	require.Len(t, report.Report.BlessedMerkleRoots, 1, "expected 1 blessed merkle root in the report")

	merkleRoot := report.Report.BlessedMerkleRoots[0]
	require.Equal(t, ccipocr3.ChainSelector(909606746561742123), merkleRoot.ChainSel, "ChainSelector should match")
	require.Equal(t, ccipocr3.SeqNum(1), merkleRoot.SeqNumsRange.Start(), "MinSeqNr should be 1")
	require.Equal(t, ccipocr3.SeqNum(1), merkleRoot.SeqNumsRange.End(), "MaxSeqNr should be 1")

	expectedMerkleRootBytes, _ := hex.DecodeString("bea275bb6614f85036536bc670e540bc748118e90537b8441c950672f74607d5")
	require.Equal(t, expectedMerkleRootBytes, merkleRoot.MerkleRoot[:], "MerkleRoot should match")

	// Validate PriceUpdates should be empty for this test (since we used merkleRootOnlyCell)
	require.Empty(t, report.Report.PriceUpdates.TokenPriceUpdates, "TokenPriceUpdates should be empty for merkle root only test")
	require.Empty(t, report.Report.PriceUpdates.GasPriceUpdates, "GasPriceUpdates should be empty for merkle root only test")
}

func Test_TonAccessorExecutionStateChangedEventQueries(t *testing.T) {
	// Test parsing ExecutionStateChanged BOCs with different states
	testCases := []struct {
		name     string
		bocHex   string
		expState uint8
	}{
		{
			name:     "in_progress_state",
			bocHex:   ExecutionStateChangedInProgressBOC,
			expState: 1, // EXECUTION_STATE_IN_PROGRESS
		},
		{
			name:     "success_state",
			bocHex:   ExecutionStateChangedSuccessBOC,
			expState: 2, // EXECUTION_STATE_SUCCESS
		},
		{
			name:     "failure_state",
			bocHex:   ExecutionStateChangedFailureBOC,
			expState: 3, // EXECUTION_STATE_FAILURE
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			bocBytes, err := hex.DecodeString(tc.bocHex)
			require.NoError(t, err, "failed to decode hex string")
			bocCell, err := cell.FromBOC(bocBytes)
			require.NoError(t, err, "failed to parse BOC from hex")

			var execEvent offramp.ExecutionStateChanged
			err = tlb.LoadFromCell(&execEvent, bocCell.BeginParse(), true) // Skip magic for logpoller
			require.NoError(t, err, "failed to decode ExecutionStateChanged from BOC")

			// Validate expected values from the TypeScript test
			require.Equal(t, uint64(ChainSelEVMTest90000001), execEvent.SourceChainSelector)
			require.Equal(t, uint64(1), execEvent.SequenceNumber)
			// MessageID should be 1 (stored as big-endian 256-bit integer)
			expectedMessageID := make([]byte, 32)
			expectedMessageID[31] = 1 // Set last byte to 1
			require.Equal(t, expectedMessageID, execEvent.MessageID)
			require.Equal(t, tc.expState, execEvent.State)
		})
	}
}

func Test_TonAccessorExecutedMessages(t *testing.T) {
	// Note: we don't test the API client interaction here, so we return empty client
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return nil, nil
	}

	// Setup in-memory store
	lggr := logger.Test(t)
	opts := &logpoller.ServiceOptions{
		Config:      logpoller.DefaultConfigSet,
		FilterStore: inmemorystore.NewFilterStore("test-chain", lggr),
		LogStore:    inmemorystore.NewLogStore("test-chain", lggr),
	}

	lp, err := logpoller.NewService(
		lggr,
		"test-chain",
		clientProvider,
		opts,
	)
	require.NoError(t, err)

	// Run common test logic with in-memory store (filterID = 1 for in-memory)
	testExecutedMessagesHelper(t, lp, opts.LogStore, 1)
}

// Test validation for MsgsBetweenSeqNums sequence number range
func Test_TonAccessor_MsgsBetweenSeqNums_SequenceRangeValidation(t *testing.T) {
	lggr := logger.Test(t)

	// Note: we don't test the API client interaction here, so we return empty client
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return nil, nil
	}

	opts := &logpoller.ServiceOptions{
		Config:      logpoller.DefaultConfigSet,
		FilterStore: inmemorystore.NewFilterStore("test-chain", lggr),
		LogStore:    inmemorystore.NewLogStore("test-chain", lggr),
	}

	lp, err := logpoller.NewService(
		lggr,
		"test-chain",
		clientProvider,
		opts,
	)
	require.NoError(t, err)

	addrCodec := codec.NewAddressCodec()
	accessor, aerr := chainaccessor.NewTONAccessor(lggr, ccipocr3.ChainSelector(ChainSelTON), nil, lp, addrCodec)
	require.NoError(t, aerr)

	t.Run("invalid range where Start > End", func(t *testing.T) {
		// Test with invalid range where Start > End
		invalidRange := ccipocr3.NewSeqNumRange(100, 50)
		msgs, err := accessor.MsgsBetweenSeqNums(context.Background(), 1, invalidRange)

		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid sequence range")
		require.Contains(t, err.Error(), "Start")
		require.Contains(t, err.Error(), "End")
		require.Nil(t, msgs)
	})

	t.Run("valid range where Start <= End returns binding error", func(t *testing.T) {
		// Test with valid range where Start <= End
		validRange := ccipocr3.NewSeqNumRange(50, 100)
		_, err := accessor.MsgsBetweenSeqNums(context.Background(), 1, validRange)

		// Should get past range validation and hit binding error instead
		require.Error(t, err)
		require.Contains(t, err.Error(), "OnRamp not bound")
		require.NotContains(t, err.Error(), "invalid sequence range")
	})

	t.Run("valid range where Start == End returns binding error", func(t *testing.T) {
		// Test with range where Start == End
		validRange := ccipocr3.NewSeqNumRange(100, 100)
		_, err := accessor.MsgsBetweenSeqNums(context.Background(), 1, validRange)

		// Should get past range validation and hit binding error instead
		require.Error(t, err)
		require.Contains(t, err.Error(), "OnRamp not bound")
		require.NotContains(t, err.Error(), "invalid sequence range")
	})
}

func Test_TonAccessorExecutedMessages_WithPostgresStore(t *testing.T) {
	// Skip if no database available
	if testing.Short() {
		t.Skip("Skipping postgres test in short mode")
	}

	// Note: we don't test the API client interaction here, so we return empty client
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return nil, nil
	}

	// Setup postgres store using testcontainers
	lggr := logger.Test(t)
	ds := pgtest.SetupTestDB(t)

	// Create TON tables
	err := pgtest.ExecuteSQL(t.Context(), ds, logpoller_testdata.CreateLogPollerTables)
	require.NoError(t, err, "failed to create TON tables")

	orm := postgresstore.NewORM("test-chain", ds, lggr)
	pgStore := postgresstore.NewLogStore("test-chain", orm, lggr)
	pgFilterStore := postgresstore.NewFilterStore("test-chain", orm, lggr)

	opts := &logpoller.ServiceOptions{
		Config:      logpoller.DefaultConfigSet,
		FilterStore: pgFilterStore,
		LogStore:    pgStore,
	}

	lp, err := logpoller.NewService(
		lggr,
		"test-chain",
		clientProvider,
		opts,
	)
	require.NoError(t, err)

	// Register filter first (required for foreign key constraint)
	filter := lptypes.Filter{
		Name:     "ExecutionStateChanged_Filter",
		Address:  address.MustParseAddr(MockOffRampAddr),
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: hash.CRC32(consts.EventNameExecutionStateChanged),
	}
	filterID, err := lp.RegisterFilter(t.Context(), filter)
	require.NoError(t, err, "failed to register filter")

	// Run common test logic with postgres store
	testExecutedMessagesHelper(t, lp, opts.LogStore, filterID)
}

// testExecutedMessagesHelper contains the common test logic for ExecutedMessages query.
// It is used by both in-memory and postgres store tests to avoid duplication.
func testExecutedMessagesHelper(t *testing.T, lp logpoller.Service, logStore logpoller.LogStore, filterID int64) {
	t.Helper()

	// Parse the ExecutionStateChanged BOCs and save them as logs
	baseTimestamp := time.Now()

	// 1. Add IN_PROGRESS event (should be included, matching EVM behavior)
	inProgressBytes, err := hex.DecodeString(ExecutionStateChangedInProgressBOC)
	require.NoError(t, err)
	inProgressCell, err := cell.FromBOC(inProgressBytes)
	require.NoError(t, err)

	// 2. Add SUCCESS event (should be included)
	successBytes, err := hex.DecodeString(ExecutionStateChangedSuccessBOC)
	require.NoError(t, err)
	successCell, err := cell.FromBOC(successBytes)
	require.NoError(t, err)

	// 3. Add FAILURE event (should be included)
	failureBytes, err := hex.DecodeString(ExecutionStateChangedFailureBOC)
	require.NoError(t, err)
	failureCell, err := cell.FromBOC(failureBytes)
	require.NoError(t, err)

	// Save logs via logStore
	savedCount, serr := logStore.SaveLogs(t.Context(), []lptypes.Log{
		{
			ChainID:      "test-chain",
			FilterID:     filterID,
			Address:      address.MustParseAddr(MockOffRampAddr),
			EventSig:     hash.CRC32(consts.EventNameExecutionStateChanged),
			Data:         inProgressCell,
			TxHash:       lptypes.TxHash{1, 2, 3, 4, 5},
			TxLT:         1000,
			TxTimestamp:  baseTimestamp.Add(1 * time.Second),
			Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 100},
			MCBlockSeqno: 200,
			MsgLT:        1000,
			MsgIndex:     0,
		},
		{
			ChainID:      "test-chain",
			FilterID:     filterID,
			Address:      address.MustParseAddr(MockOffRampAddr),
			EventSig:     hash.CRC32(consts.EventNameExecutionStateChanged),
			Data:         successCell,
			TxHash:       lptypes.TxHash{2, 3, 4, 5, 6},
			TxLT:         1001,
			TxTimestamp:  baseTimestamp.Add(2 * time.Second),
			Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 101},
			MCBlockSeqno: 201,
			MsgLT:        1001,
			MsgIndex:     1,
		},
		{
			ChainID:      "test-chain",
			FilterID:     filterID,
			Address:      address.MustParseAddr(MockOffRampAddr),
			EventSig:     hash.CRC32(consts.EventNameExecutionStateChanged),
			Data:         failureCell,
			TxHash:       lptypes.TxHash{3, 4, 5, 6, 7},
			TxLT:         1002,
			TxTimestamp:  baseTimestamp.Add(3 * time.Second),
			Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 102},
			MCBlockSeqno: 202,
			MsgLT:        1002,
			MsgIndex:     2,
		},
	}, logpoller.DefaultConfigSet.BatchInsertSize, logpoller.DefaultConfigSet.MinBatchSize)
	require.NoError(t, serr, "failed to save logs")
	require.Equal(t, int64(3), savedCount, "should have saved 3 logs")

	// Setup accessor
	addrCodec := codec.NewAddressCodec()
	accessor, aerr := chainaccessor.NewTONAccessor(logger.Test(t), ccipocr3.ChainSelector(ChainSelTON), nil, lp, addrCodec)
	require.NoError(t, aerr)

	rawMockOffRampAddr, err := addrCodec.AddressStringToBytes(MockOffRampAddr)
	require.NoError(t, err)
	err = accessor.Sync(t.Context(), consts.ContractNameOffRamp, rawMockOffRampAddr)
	require.NoError(t, err)

	// Test ExecutedMessages query
	ranges := map[ccipocr3.ChainSelector][]ccipocr3.SeqNumRange{
		ccipocr3.ChainSelector(ChainSelEVMTest90000001): {
			ccipocr3.NewSeqNumRange(1, 1), // Query for sequence number 1
		},
	}

	executed, err := accessor.ExecutedMessages(t.Context(), ranges, primitives.Finalized)
	require.NoError(t, err, "failed to get executed messages")

	// Should return exactly 3 executed messages (IN_PROGRESS, SUCCESS and FAILURE, all > 0 states)
	require.Len(t, executed, 1, "should have executed messages for 1 chain")

	executedSeqNums := executed[ccipocr3.ChainSelector(ChainSelEVMTest90000001)]
	require.Len(t, executedSeqNums, 3, "should have 3 executed messages (IN_PROGRESS, SUCCESS and FAILURE)")

	// Verify all sequence numbers are 1 (from our test BOCs)
	for _, seqNum := range executedSeqNums {
		require.Equal(t, ccipocr3.SeqNum(1), seqNum, "sequence number should be 1")
	}
}
