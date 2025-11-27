package model

import (
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/model"
)

// ---------- Helpers ----------

func mustBigInt(s string) *big.Int {
	v, ok := new(big.Int).SetString(s, 10)
	if !ok {
		panic("invalid big.Int literal: " + s)
	}
	return v
}

func mustTimestamp(ts string) time.Time {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		panic("invalid RFC3339 time: " + ts)
	}
	return t
}

// ---------- Test using the loader ----------

func TestDecodeFeeQuoterData(t *testing.T) {
	// GIVEN: a fee quoter storage model
	ownerAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAu8e")
	pendingOwnerAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABZ_5")
	offRampAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_8_")
	tonTokenAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99")
	linkTokenAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABI_Y")

	storage, err := model.NewFeeQuoterStorageBuilder().
		WithID(1000).
		WithOwnable(
			ownerAddress,
			pendingOwnerAddress,
		).
		WithAllowedPriceUpdater(offRampAddress).
		WithMaxFeeJuelsPerMsg(big.NewInt(1000)).
		WithLinkToken(linkTokenAddress).
		WithTokenPriceStalenessThreshold(uint64(3600)).
		// USDPerToken
		WithUSDPerToken(tonTokenAddress, big.NewInt(1804194200000000000), mustTimestamp("2025-11-18T17:58:08Z")).
		WithUSDPerToken(linkTokenAddress, mustBigInt("13819996070000000000"), mustTimestamp("2025-11-18T17:58:08Z")).
		// PremiumMultiplierWeiPerEthByToken
		WithPremiumMultiplier(tonTokenAddress, 1).
		// DestChainConfigs
		WithDestChainConfig(14767482510784806043, model.DestChainConfigs{
			Config: model.DestChainConfig{
				IsEnabled:                         true,
				MaxNumberOfTokensPerMsg:           1,
				MaxDataBytes:                      30000,
				MaxPerMsgGasLimit:                 3000000,
				DestGasOverhead:                   300000,
				DestGasPerPayloadByteBase:         16,
				DestGasPerPayloadByteHigh:         16,
				DestGasPerPayloadByteThreshold:    3000,
				DestDataAvailabilityOverheadGas:   0,
				DestGasPerDataAvailabilityByte:    16,
				DestDataAvailabilityMultiplierBps: 0,
				ChainFamilySelector:               672322860,
				DefaultTokenFeeUsdCents:           25,
				DefaultTokenDestGasOverhead:       90000,
				DefaultTxGasLimit:                 200000,
				GasMultiplierWeiPerEth:            1100000000000000000,
				GasPriceStalenessThreshold:        0,
				NetworkFeeUsdCents:                10,
			},
			USDPerUnitGas: model.USDPerUnitGas{
				ExecutionGasPrice:        big.NewInt(14713549000),
				DataAvailabilityGasPrice: big.NewInt(0),
				Timestamp:                mustTimestamp("2025-11-18T17:59:46Z"),
			},
		}).
		WithDestChainConfig(16015286601757825753, model.DestChainConfigs{
			Config: model.DestChainConfig{
				IsEnabled:                         true,
				MaxNumberOfTokensPerMsg:           1,
				MaxDataBytes:                      30000,
				MaxPerMsgGasLimit:                 3000000,
				DestGasOverhead:                   300000,
				DestGasPerPayloadByteBase:         16,
				DestGasPerPayloadByteHigh:         16,
				DestGasPerPayloadByteThreshold:    3000,
				DestDataAvailabilityOverheadGas:   0,
				DestGasPerDataAvailabilityByte:    16,
				DestDataAvailabilityMultiplierBps: 0,
				ChainFamilySelector:               672322860,
				DefaultTokenFeeUsdCents:           25,
				DefaultTokenDestGasOverhead:       90000,
				DefaultTxGasLimit:                 200000,
				GasMultiplierWeiPerEth:            1100000000000000000,
				GasPriceStalenessThreshold:        0,
				NetworkFeeUsdCents:                10,
			},
			USDPerUnitGas: model.USDPerUnitGas{
				ExecutionGasPrice:        big.NewInt(4701260146),
				DataAvailabilityGasPrice: big.NewInt(0),
				Timestamp:                mustTimestamp("2025-11-18T17:59:46Z"),
			},
		}).
		WithDestChainConfig(3478487238524512106, model.DestChainConfigs{
			Config: model.DestChainConfig{
				IsEnabled:                         true,
				MaxNumberOfTokensPerMsg:           1,
				MaxDataBytes:                      30000,
				MaxPerMsgGasLimit:                 3000000,
				DestGasOverhead:                   300000,
				DestGasPerPayloadByteBase:         16,
				DestGasPerPayloadByteHigh:         16,
				DestGasPerPayloadByteThreshold:    3000,
				DestDataAvailabilityOverheadGas:   0,
				DestGasPerDataAvailabilityByte:    16,
				DestDataAvailabilityMultiplierBps: 0,
				ChainFamilySelector:               672322860,
				DefaultTokenFeeUsdCents:           25,
				DefaultTokenDestGasOverhead:       90000,
				DefaultTxGasLimit:                 200000,
				GasMultiplierWeiPerEth:            1100000000000000000,
				GasPriceStalenessThreshold:        0,
				NetworkFeeUsdCents:                10,
			},
			USDPerUnitGas: model.USDPerUnitGas{
				ExecutionGasPrice:        big.NewInt(470175000000),
				DataAvailabilityGasPrice: big.NewInt(661379),
				Timestamp:                mustTimestamp("2025-11-18T17:59:46Z"),
			},
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

		// AllowedPriceUpdaters
		require.Len(t, storage.AllowedPriceUpdaters, 1)
		require.Equal(t, offRampAddress, storage.AllowedPriceUpdaters[0])

		// MaxFeeJuelsPerMsg
		require.Equal(t, big.NewInt(1000), storage.MaxFeeJuelsPerMsg)

		// LinkToken
		require.Equal(t, linkTokenAddress, storage.LinkToken)

		// TokenPriceStalenessThreshold
		require.Equal(t, uint64(3600), storage.TokenPriceStalenessThreshold)

		// USDPerToken
		require.Len(t, storage.USDPerToken, 2)

		tonPrice, ok := storage.USDPerToken[tonTokenAddress.String()]
		require.True(t, ok)
		require.Equal(t, "1804194200000000000", tonPrice.Value.String())
		require.Equal(t, mustTimestamp("2025-11-18T17:58:08Z"), tonPrice.Timestamp)

		linkPrice, ok := storage.USDPerToken[linkTokenAddress.String()]
		require.True(t, ok)
		require.Equal(t, "13819996070000000000", linkPrice.Value.String())
		require.Equal(t, mustTimestamp("2025-11-18T17:58:08Z"), linkPrice.Timestamp)

		// PremiumMultiplierWeiPerEthByToken
		require.Len(t, storage.PremiumMultiplierWeiPerEthByToken, 1)
		require.Equal(t, uint64(1), storage.PremiumMultiplierWeiPerEthByToken[tonTokenAddress.String()])

		// DestChainConfigs
		require.Len(t, storage.DestChainConfigsByChainSelector, 3)

		// Selector: 14767482510784806043
		cfg1, ok := storage.DestChainConfigsByChainSelector[14767482510784806043]
		require.True(t, ok)

		require.True(t, cfg1.Config.IsEnabled)
		require.Equal(t, uint16(1), cfg1.Config.MaxNumberOfTokensPerMsg)
		require.Equal(t, uint32(30000), cfg1.Config.MaxDataBytes)
		require.Equal(t, uint32(3000000), cfg1.Config.MaxPerMsgGasLimit)
		require.Equal(t, uint32(300000), cfg1.Config.DestGasOverhead)
		require.Equal(t, uint8(16), cfg1.Config.DestGasPerPayloadByteBase)
		require.Equal(t, uint8(16), cfg1.Config.DestGasPerPayloadByteHigh)
		require.Equal(t, uint16(3000), cfg1.Config.DestGasPerPayloadByteThreshold)
		require.Equal(t, uint32(0), cfg1.Config.DestDataAvailabilityOverheadGas)
		require.Equal(t, uint16(16), cfg1.Config.DestGasPerDataAvailabilityByte)
		require.Equal(t, uint16(0), cfg1.Config.DestDataAvailabilityMultiplierBps)
		require.Equal(t, uint32(672322860), cfg1.Config.ChainFamilySelector)
		require.Equal(t, uint16(25), cfg1.Config.DefaultTokenFeeUsdCents)
		require.Equal(t, uint32(90000), cfg1.Config.DefaultTokenDestGasOverhead)
		require.Equal(t, uint32(200000), cfg1.Config.DefaultTxGasLimit)
		require.Equal(t, uint64(1100000000000000000), cfg1.Config.GasMultiplierWeiPerEth)
		require.Equal(t, uint32(0), cfg1.Config.GasPriceStalenessThreshold)
		require.Equal(t, uint32(10), cfg1.Config.NetworkFeeUsdCents)

		require.Equal(t, "14713549000", cfg1.USDPerUnitGas.ExecutionGasPrice.String())
		require.Equal(t, "0", cfg1.USDPerUnitGas.DataAvailabilityGasPrice.String())
		require.Equal(t, mustTimestamp("2025-11-18T17:59:46Z"), cfg1.USDPerUnitGas.Timestamp)

		// Selector: 16015286601757825753
		cfg2, ok := storage.DestChainConfigsByChainSelector[16015286601757825753]
		require.True(t, ok)

		require.True(t, cfg2.Config.IsEnabled)
		require.Equal(t, uint16(1), cfg2.Config.MaxNumberOfTokensPerMsg)
		require.Equal(t, uint32(30000), cfg2.Config.MaxDataBytes)
		require.Equal(t, uint32(3000000), cfg2.Config.MaxPerMsgGasLimit)
		require.Equal(t, uint32(300000), cfg2.Config.DestGasOverhead)
		require.Equal(t, uint8(16), cfg2.Config.DestGasPerPayloadByteBase)
		require.Equal(t, uint8(16), cfg2.Config.DestGasPerPayloadByteHigh)
		require.Equal(t, uint16(3000), cfg2.Config.DestGasPerPayloadByteThreshold)
		require.Equal(t, uint32(0), cfg2.Config.DestDataAvailabilityOverheadGas)
		require.Equal(t, uint16(16), cfg2.Config.DestGasPerDataAvailabilityByte)
		require.Equal(t, uint16(0), cfg2.Config.DestDataAvailabilityMultiplierBps)
		require.Equal(t, uint32(672322860), cfg2.Config.ChainFamilySelector)
		require.Equal(t, uint16(25), cfg2.Config.DefaultTokenFeeUsdCents)
		require.Equal(t, uint32(90000), cfg2.Config.DefaultTokenDestGasOverhead)
		require.Equal(t, uint32(200000), cfg2.Config.DefaultTxGasLimit)
		require.Equal(t, uint64(1100000000000000000), cfg2.Config.GasMultiplierWeiPerEth)
		require.Equal(t, uint32(0), cfg2.Config.GasPriceStalenessThreshold)
		require.Equal(t, uint32(10), cfg2.Config.NetworkFeeUsdCents)

		require.Equal(t, "4701260146", cfg2.USDPerUnitGas.ExecutionGasPrice.String())
		require.Equal(t, "0", cfg2.USDPerUnitGas.DataAvailabilityGasPrice.String())
		require.Equal(t, mustTimestamp("2025-11-18T17:59:46Z"), cfg2.USDPerUnitGas.Timestamp)

		// Selector: 3478487238524512106
		cfg3, ok := storage.DestChainConfigsByChainSelector[3478487238524512106]
		require.True(t, ok)

		require.Equal(t, uint16(1), cfg3.Config.MaxNumberOfTokensPerMsg)
		require.Equal(t, uint32(30000), cfg3.Config.MaxDataBytes)
		require.Equal(t, uint32(3000000), cfg3.Config.MaxPerMsgGasLimit)
		require.Equal(t, uint32(300000), cfg3.Config.DestGasOverhead)
		require.Equal(t, uint8(16), cfg3.Config.DestGasPerPayloadByteBase)
		require.Equal(t, uint8(16), cfg3.Config.DestGasPerPayloadByteHigh)
		require.Equal(t, uint16(3000), cfg3.Config.DestGasPerPayloadByteThreshold)
		require.Equal(t, uint32(0), cfg3.Config.DestDataAvailabilityOverheadGas)
		require.Equal(t, uint16(16), cfg3.Config.DestGasPerDataAvailabilityByte)
		require.Equal(t, uint16(0), cfg3.Config.DestDataAvailabilityMultiplierBps)
		require.Equal(t, uint32(672322860), cfg3.Config.ChainFamilySelector)
		require.Equal(t, uint16(25), cfg3.Config.DefaultTokenFeeUsdCents)
		require.Equal(t, uint32(90000), cfg3.Config.DefaultTokenDestGasOverhead)
		require.Equal(t, uint32(200000), cfg3.Config.DefaultTxGasLimit)
		require.Equal(t, uint64(1100000000000000000), cfg3.Config.GasMultiplierWeiPerEth)
		require.Equal(t, uint32(0), cfg3.Config.GasPriceStalenessThreshold)
		require.Equal(t, uint32(10), cfg3.Config.NetworkFeeUsdCents)

		require.Equal(t, "470175000000", cfg3.USDPerUnitGas.ExecutionGasPrice.String())
		require.Equal(t, "661379", cfg3.USDPerUnitGas.DataAvailabilityGasPrice.String())
		require.Equal(t, mustTimestamp("2025-11-18T17:59:46Z"), cfg3.USDPerUnitGas.Timestamp)
	})

	t.Run("TestMapper", func(t *testing.T) {
		t.Parallel()

		hexData := "b5ee9c7241020e0100028b0004f9000003e88000000000000000000000000000000000000000000000000000000000000000005800000000000000000000000000000000000000000000000000000000000000000b0000000000000000000003e880000000000000000000000000000000000000000000000000000000000000000080000000000001c21e010203040045a17000000000000000000000000000000000000000000000000000000000000000000e0245a11000000000000000000000000000000000000000000000000000000000000000001005060055a170000000000000000000000000000000000000000000000000000000000000000004000000000000000602012007080041640000000000000000000000000000000000000000642724437347c001a472cec20041d00000000000000000000000000000000000000005fe53e9a22d27e00348e59d840183bf608c236d5ff74ed5000100007530002dc6c0000493e010100bb800000000001000002812d52c001900015f9000030d400f43fc2c04ee0000000000000000000a400902016a0a0b00480000000000000000006d789d25c000000000000000000000000a178300000000691cb4120181bccf0a31a221f3c9b800080003a980016e360000249f0080805dc000000000008000014096a96000c8000afc8000186a007a1fe1602770000000000000000000520c0181bce41ba4fc9d91ad9800080003a980016e360000249f0080805dc000000000008000014096a96000c8000afc8000186a007a1fe1602770000000000000000000520d0048000000000000000000036cfef0c8000000000000000000000000000000000000691cb41200480000000000000000000118378972000000000000000000000000000000000000691cb412bff80f32"

		AssertHexMappingRoundTrip[feequoter.Storage](
			t,
			hexData,
			storage, // original
			func() model.Mapper[feequoter.Storage] {
				// empty instance to decode into
				return &model.FeeQuoterStorage{}
			},
		)
	})
}
