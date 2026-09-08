package model

import (
	"math/big"
	"testing"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/model"

	"github.com/stretchr/testify/require"
)

func TestDecodeOffRampData(t *testing.T) {
	// GIVEN: a offramp storage model
	ownerAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAu8e")
	pendingOwnerAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABZ_5")
	feeQuoter := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_8_")
	rmnRouter := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABI_Y")
	commitSigners := []string{
		"031a8e6486f688260ac6c785158bf55a890b5c084286135910d0d2c00ed3ffc1",
		"28701bcf04074c4ac8d967eb917c70182a1456d0f4e6475424c7b78c9628a044",
		"7d2bb364019d6b1c6797764ff0cbc389348e1a06295f526f3f45be1b86f807ec",
		"9f47d53bebac3400c00e2ae0cefda055b9b233cc5177e6dd0daabc0fb3990dc5",
	}
	transmitters := []*address.Address{
		ownerAddress,
		feeQuoter,
		rmnRouter,
		pendingOwnerAddress,
	}
	configDigest := "000a8a867649d8f27ab8131eee7667e2526465dc44e734004d4759a63a4409c9"
	var chainSelector1 uint64 = 14767482510784806043
	var chainSelector2 uint64 = 16015286601757825753
	var tonChainSelector uint64 = 1399300952838017768
	onRamp1 := "f3a9c7d8124efb669a21be88d5c4a91737deaa01"
	onRamp2 := "9bd62cee17a40f59c81203bb48c15ef3a5fdc47e"

	storage, err := model.NewOffRampStorageBuilder().
		WithID(1000).
		WithOwnable(
			ownerAddress.Copy(),
			pendingOwnerAddress.Copy(),
		).
		WithRMNRouter(rmnRouter.Copy()).
		WithFeeQuoter(feeQuoter.Copy()).
		WithOCR3BaseChainID(1).
		WithOCR3CommitConfig(&model.OCR3Config{
			Signers:      commitSigners,
			Transmitters: transmitters,
			ConfigDigest: configDigest,
			F:            1,
			N:            4,
		}).
		WithOCR3ExecuteConfig(&model.OCR3Config{
			Transmitters: transmitters,
			ConfigDigest: configDigest,
			F:            1,
			N:            0,
		}).
		WithCursedSubject(new(big.Int).SetUint64(chainSelector1)).
		WithCursedSubject(new(big.Int).SetUint64(chainSelector2)).
		WithChainSelector(tonChainSelector).
		WithPermissionlessExecutionThresholdSeconds(uint32(120)).
		WithLatestPriceSequenceNumber(uint64(1000)).
		WithSourceChainConfig(chainSelector1, model.SourceChainConfig{
			Router:                    rmnRouter,
			IsEnabled:                 true,
			MinSeqNr:                  1,
			IsRMNVerificationDisabled: false,
			OnRamp:                    onRamp1,
		}).
		WithSourceChainConfig(chainSelector2, model.SourceChainConfig{
			Router:                    rmnRouter,
			IsEnabled:                 false,
			MinSeqNr:                  2,
			IsRMNVerificationDisabled: true,
			OnRamp:                    onRamp2,
		}).
		Build()
	require.NoError(t, err)

	t.Run("TestModel", func(t *testing.T) {
		t.Parallel()

		// ID
		require.Equal(t, uint32(1000), storage.ID)

		// Ownable
		require.Equal(t, ownerAddress, storage.Ownable.Owner)
		require.Equal(t, pendingOwnerAddress, storage.Ownable.PendingOwner)

		// RMN Router
		require.Equal(t, rmnRouter, storage.Deployables.RMNRouter)

		// FeeQuoter
		require.Equal(t, feeQuoter, storage.FeeQuoter)

		// OCR3 base chain ID
		require.Equal(t, 1, storage.OCR3Base.ChainID)

		// OCR3 Commit config
		require.NotNil(t, storage.OCR3Base.Commit)
		require.Equal(t, configDigest, storage.OCR3Base.Commit.ConfigDigest)
		require.Equal(t, 1, storage.OCR3Base.Commit.F)
		require.Equal(t, 4, storage.OCR3Base.Commit.N)
		require.Len(t, storage.OCR3Base.Commit.Signers, len(commitSigners))
		require.Equal(t, commitSigners, storage.OCR3Base.Commit.Signers)
		require.Len(t, storage.OCR3Base.Commit.Transmitters, len(transmitters))
		require.Equal(t, transmitters, storage.OCR3Base.Commit.Transmitters)

		// OCR3 Execute config
		require.NotNil(t, storage.OCR3Base.Execute)
		require.Equal(t, configDigest, storage.OCR3Base.Execute.ConfigDigest)
		require.Equal(t, 1, storage.OCR3Base.Execute.F)
		require.Equal(t, 0, storage.OCR3Base.Execute.N)
		require.Empty(t, storage.OCR3Base.Execute.Signers)
		require.Len(t, storage.OCR3Base.Execute.Transmitters, len(transmitters))
		require.Equal(t, transmitters, storage.OCR3Base.Execute.Transmitters)

		// Cursed subjects (2 entries)
		require.Len(t, storage.CursedSubjects, 2)

		require.Equal(t, storage.CursedSubjects[0].Uint64(), chainSelector1)
		require.Equal(t, storage.CursedSubjects[1].Uint64(), chainSelector2)

		// Chain selector
		require.Equal(t, tonChainSelector, storage.ChainSelector)

		// Permissionless execution threshold
		require.Equal(t, uint32(120), storage.PermissionlessExecutionThresholdSeconds)

		// Latest price sequence number
		require.Equal(t, uint64(1000), storage.LatestPriceSequenceNumber)

		// Source chain configs map
		require.Len(t, storage.SourceChainConfigs, 2)

		cfg1, ok := storage.SourceChainConfigs[chainSelector1]
		require.True(t, ok)
		require.Equal(t, rmnRouter, cfg1.Router)
		require.True(t, cfg1.IsEnabled)
		require.Equal(t, uint64(1), cfg1.MinSeqNr)
		require.False(t, cfg1.IsRMNVerificationDisabled)
		require.Equal(t, onRamp1, cfg1.OnRamp)

		cfg2, ok := storage.SourceChainConfigs[chainSelector2]
		require.True(t, ok)
		require.Equal(t, rmnRouter, cfg2.Router)
		require.False(t, cfg2.IsEnabled)
		require.Equal(t, uint64(2), cfg2.MinSeqNr)
		require.True(t, cfg2.IsRMNVerificationDisabled)
		require.Equal(t, onRamp2, cfg2.OnRamp)
	})

	t.Run("TestMapper", func(t *testing.T) {
		t.Parallel()

		hexData := "b5ee9c72410216010002870004f9000003e880000000000000000000000000000000000000000000000000000000000000000050000000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000001c4dad43360f1a4ba0000001e200000000000007d1001020304004380000000000000000000000000000000000000000000000000000000000000000084020301e00506021390c000000000000000340708020276090a0245000a8a867649d8f27ab8131eee7667e2526465dc44e734004d4759a63a4409c90104700b0c0145000a8a867649d8f27ab8131eee7667e2526465dc44e734004d4759a63a4409c90100300c0011bccf0a31a221f3c9b80011bce41ba4fc9d91ad98008fbccf0a31a221f3c9b800000000000000000000000000000000000000000000000000000000000000000900000000000000010a79d4e3ec09277db34d10df446ae2548b9bef5500c0008fbce41ba4fc9d91ad9800000000000000000000000000000000000000000000000000000000000000000800000000000000028a4deb16770bd207ace40901dda460af79d2fee23f400201200d0e0245a1100000000000000000000000000000000000000000000000000000000000000000100f1002012011120043bfcfa3ea9df5d61a0060071570677ed02adcd919e628bbf36e86d55e07d9cc86e2c00201581313020148131302012014150042bfbd2bb364019d6b1c6797764ff0cbc389348e1a06295f526f3f45be1b86f807ec0001200041bf46351cc90ded104c158d8f0a2b17eab51216b810850c26b221a1a5801da7ff830041bf50e0379e080e989591b2cfd722f8e0305428ada1e9cc8ea8498f6f192c514089dcc5c78d"

		AssertHexMappingRoundTrip[offramp.Storage](
			t,
			hexData,
			storage, // original
			func() model.Mapper[offramp.Storage] {
				// empty instance to decode into
				return &model.OffRampStorage{}
			},
		)
	})
}
