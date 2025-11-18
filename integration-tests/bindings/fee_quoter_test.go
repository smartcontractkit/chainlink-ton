package bindings

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"testing"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"

	"github.com/stretchr/testify/require"
)

// ---------- Fee Quoter Model Struct Definitions ----------
type Storage struct {
	ID                                uint32                      `json:"id"`
	Ownable                           Ownable2Step                `json:"ownable"`
	AllowedPriceUpdaters              []*address.Address          `json:"allowedPriceUpdaters"`
	MaxFeeJuelsPerMsg                 *big.Int                    `json:"maxFeeJuelsPerMsg"`
	LinkToken                         *address.Address            `json:"linkToken"`
	TokenPriceStalenessThreshold      uint64                      `json:"tokenPriceStalenessThreshold"`
	USDPerToken                       map[string]TimestampedPrice `json:"usdPerToken"`
	PremiumMultiplierWeiPerEthByToken map[string]uint64           `json:"premiumMultiplierWeiPerEthByToken"`
	DestChainConfigsByChainSelector   map[uint64]DestChainConfigs `json:"destChainConfigsByChainSelector"`
}

type Ownable2Step struct {
	Owner        *address.Address `json:"owner"`
	PendingOwner *address.Address `json:"pendingOwner,omitempty"`
}

type DestChainConfigs struct {
	Config        DestChainConfig `json:"config"`
	USDPerUnitGas USDPerUnitGas   `json:"usdPerUnitGas"`
}

type DestChainConfig struct {
	IsEnabled                         bool   `json:"isEnabled"`
	MaxNumberOfTokensPerMsg           uint16 `json:"maxNumberOfTokensPerMsg"`
	MaxDataBytes                      uint32 `json:"maxDataBytes"`
	MaxPerMsgGasLimit                 uint32 `json:"maxPerMsgGasLimit"`
	DestGasOverhead                   uint32 `json:"destGasOverhead"`
	DestGasPerPayloadByteBase         uint8  `json:"destGasPerPayloadByteBase"`
	DestGasPerPayloadByteHigh         uint8  `json:"destGasPerPayloadByteHigh"`
	DestGasPerPayloadByteThreshold    uint16 `json:"destGasPerPayloadByteThreshold"`
	DestDataAvailabilityOverheadGas   uint32 `json:"destDataAvailabilityOverheadGas"`
	DestGasPerDataAvailabilityByte    uint16 `json:"destGasPerDataAvailabilityByte"`
	DestDataAvailabilityMultiplierBps uint16 `json:"destDataAvailabilityMultiplierBps"`
	ChainFamilySelector               uint32 `json:"chainFamilySelector"`
	DefaultTokenFeeUsdCents           uint16 `json:"defaultTokenFeeUsdCents"`
	DefaultTokenDestGasOverhead       uint32 `json:"defaultTokenDestGasOverhead"`
	DefaultTxGasLimit                 uint32 `json:"defaultTxGasLimit"`
	GasMultiplierWeiPerEth            uint64 `json:"gasMultiplierWeiPerEth"`
	GasPriceStalenessThreshold        uint32 `json:"gasPriceStalenessThreshold"`
	NetworkFeeUsdCents                uint32 `json:"networkFeeUsdCents"`
}

type USDPerUnitGas struct {
	ExecutionGasPrice        *big.Int  `json:"executionGasPrice"`
	DataAvailabilityGasPrice *big.Int  `json:"dataAvailabilityGasPrice"`
	Timestamp                time.Time `json:"timestamp"`
}

type TimestampedPrice struct {
	Value     *big.Int  `json:"value"`
	Timestamp time.Time `json:"timestamp"`
}

// ---------- Loader (no testing deps) ----------

func LoadFeeQuoterStateFromHex(feeQuoterDataHex string) (Storage, error) {
	var out Storage

	// Decode hex
	boc, err := hex.DecodeString(feeQuoterDataHex)
	if err != nil {
		return out, fmt.Errorf("decode hex: %w", err)
	}

	root, err := cell.FromBOC(boc)
	if err != nil {
		return out, fmt.Errorf("parse BOC: %w", err)
	}
	if root == nil {
		return out, fmt.Errorf("parse BOC: nil root cell")
	}

	// Load raw TL-B storage
	var raw feequoter.Storage
	if err := tlb.LoadFromCell(&raw, root.BeginParse()); err != nil {
		return out, fmt.Errorf("load TL-B storage: %w", err)
	}

	// Initialize canonical model
	out.ID = raw.ID
	out.Ownable = Ownable2Step{
		Owner:        raw.Ownable.Owner,
		PendingOwner: raw.Ownable.PendingOwner,
	}
	out.AllowedPriceUpdaters = make([]*address.Address, 0)
	out.MaxFeeJuelsPerMsg = raw.MaxFeeJuelsPerMsg
	out.LinkToken = raw.LinkToken
	out.TokenPriceStalenessThreshold = raw.TokenPriceStalenessThreshold

	out.USDPerToken = make(map[string]TimestampedPrice)
	out.PremiumMultiplierWeiPerEthByToken = make(map[string]uint64)
	out.DestChainConfigsByChainSelector = make(map[uint64]DestChainConfigs)

	// AllowedPriceUpdaters
	if apus, err := raw.AllowedPriceUpdaters.LoadAll(); err != nil {
		return out, fmt.Errorf("load AllowedPriceUpdaters: %w", err)
	} else {
		for _, kv := range apus {
			var w common.WrappedAddress
			if err := tlb.LoadFromCell(&w, kv.Key); err != nil {
				return out, fmt.Errorf("decode AllowedPriceUpdater key: %w", err)
			}
			out.AllowedPriceUpdaters = append(out.AllowedPriceUpdaters, w.WrappedAddress)
		}
	}

	// DestChainConfigs
	dccs, err := raw.DestChainConfigs.LoadAll()
	if err != nil {
		return out, fmt.Errorf("load DestChainConfigs: %w", err)
	}
	for _, kv := range dccs {
		selector, err := kv.Key.LoadUInt(64)
		if err != nil {
			return out, fmt.Errorf("decode chain selector: %w", err)
		}

		var dcc feequoter.DestChainConfigs
		if err := tlb.LoadFromCell(&dcc, kv.Value); err != nil {
			return out, fmt.Errorf("decode DestChainConfigs value: %w", err)
		}

		var gas feequoter.USDPerUnitGas
		if err := tlb.LoadFromCell(&gas, dcc.USDPerUnitGasRef.BeginParse()); err != nil {
			return out, fmt.Errorf("decode USDPerUnitGas: %w", err)
		}

		out.DestChainConfigsByChainSelector[selector] = DestChainConfigs{
			Config: DestChainConfig{
				IsEnabled:                         dcc.Config.IsEnabled,
				MaxNumberOfTokensPerMsg:           dcc.Config.MaxNumberOfTokensPerMsg,
				MaxDataBytes:                      dcc.Config.MaxDataBytes,
				MaxPerMsgGasLimit:                 dcc.Config.MaxPerMsgGasLimit,
				DestGasOverhead:                   dcc.Config.DestGasOverhead,
				DestGasPerPayloadByteBase:         dcc.Config.DestGasPerPayloadByteBase,
				DestGasPerPayloadByteHigh:         dcc.Config.DestGasPerPayloadByteHigh,
				DestGasPerPayloadByteThreshold:    dcc.Config.DestGasPerPayloadByteThreshold,
				DestDataAvailabilityOverheadGas:   dcc.Config.DestDataAvailabilityOverheadGas,
				DestGasPerDataAvailabilityByte:    dcc.Config.DestGasPerDataAvailabilityByte,
				DestDataAvailabilityMultiplierBps: dcc.Config.DestDataAvailabilityMultiplierBps,
				ChainFamilySelector:               dcc.Config.ChainFamilySelector,
				DefaultTokenFeeUsdCents:           dcc.Config.DefaultTokenFeeUsdCents,
				DefaultTokenDestGasOverhead:       dcc.Config.DefaultTokenDestGasOverhead,
				DefaultTxGasLimit:                 dcc.Config.DefaultTxGasLimit,
				GasMultiplierWeiPerEth:            dcc.Config.GasMultiplierWeiPerEth,
				GasPriceStalenessThreshold:        dcc.Config.GasPriceStalenessThreshold,
				NetworkFeeUsdCents:                dcc.Config.NetworkFeeUsdCents,
			},
			USDPerUnitGas: USDPerUnitGas{
				ExecutionGasPrice:        gas.ExecutionGasPrice,
				DataAvailabilityGasPrice: gas.DataAvailabilityGasPrice,
				Timestamp:                time.Unix(int64(gas.Timestamp), 0).UTC(),
			},
		}
	}

	// USDPerToken
	usdItems, err := raw.UsdPerToken.LoadAll()
	if err != nil {
		return out, fmt.Errorf("load UsdPerToken: %w", err)
	}
	for _, kv := range usdItems {
		var token common.WrappedAddress
		if err := tlb.LoadFromCell(&token, kv.Key); err != nil {
			return out, fmt.Errorf("decode UsdPerToken key: %w", err)
		}

		var price feequoter.TimestampedPrice
		if err := tlb.LoadFromCell(&price, kv.Value); err != nil {
			return out, fmt.Errorf("decode UsdPerToken value: %w", err)
		}

		out.USDPerToken[token.WrappedAddress.String()] = TimestampedPrice{
			Value:     price.Value,
			Timestamp: time.Unix(int64(price.Timestamp), 0).UTC(),
		}
	}

	// PremiumMultiplierWeiPerEth
	pmItems, err := raw.PremiumMultiplierWeiPerEth.LoadAll()
	if err != nil {
		return out, fmt.Errorf("load PremiumMultiplierWeiPerEth: %w", err)
	}
	for _, kv := range pmItems {
		var token common.WrappedAddress
		if err := tlb.LoadFromCell(&token, kv.Key); err != nil {
			return out, fmt.Errorf("decode PremiumMultiplier key: %w", err)
		}

		val, err := kv.Value.LoadUInt(64)
		if err != nil {
			return out, fmt.Errorf("decode PremiumMultiplier value: %w", err)
		}

		out.PremiumMultiplierWeiPerEthByToken[token.WrappedAddress.String()] = val
	}

	return out, nil
}

// ---------- Test using the loader ----------

func TestDecodeFeeQuoterData(t *testing.T) {
	hexData := "b5ee9c7241020e0100028b0004b7000003e88000000000000000000000000000000000000000000000000000000000000000002800000000000000000000000c00036b75ba1b49d28935786ba7ae440e367d4f50c521276fe59e0e972bb56cc0da0000000000000000f0010203040045a17000000000000000000000000000000000000000000000000000000000000000000602078230000805060055a170000000000000000000000000000000000000000000000000000000000000000004000000000000000602012007080081be400000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000032139221b9a3e000d239676100081be6d6eb743693a5126af0d74f5c881c6cfa9ea18a424edfcb3c1d2e576ad981b400000000000000000000000000000000000000017f94fa688b49f800d239676100183bf608c236d5ff74ed5000100007530002dc6c0000493e010100bb800000000001000002812d52c001900015f9000030d400f43fc2c04ee0000000000000000000a400902016a0a0b00480000000000000000006d789d25c000000000000000000000000a178300000000691cb4120181bccf0a31a221f3c9b800080003a980016e360000249f0080805dc000000000008000014096a96000c8000afc8000186a007a1fe1602770000000000000000000520c0181bce41ba4fc9d91ad9800080003a980016e360000249f0080805dc000000000008000014096a96000c8000afc8000186a007a1fe1602770000000000000000000520d0048000000000000000000036cfef0c8000000000000000000000000000000000000691cb41200480000000000000000000118378972000000000000000000000000000000000000691cb4125bf0c8e8"

	storage, err := LoadFeeQuoterStateFromHex(hexData)
	require.NoError(t, err)

	b, err := json.MarshalIndent(storage, "", "  ")
	require.NoError(t, err)

	// Print clean, pretty JSON (no escaping)
	t.Logf("\n%s", b)

	// Assertions
	require.Equal(t, uint32(1000), storage.ID)
	require.Equal(t, "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99", storage.Ownable.Owner.String())
	require.Equal(t, "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8", storage.LinkToken.String())
	require.Equal(t, uint64(0), storage.TokenPriceStalenessThreshold)

	// Allowed updaters
	require.Equal(t, 1, len(storage.AllowedPriceUpdaters))
	require.Equal(t, "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99", storage.AllowedPriceUpdaters[0].String())

	// USDPerToken
	require.Equal(t, 2, len(storage.USDPerToken))
	require.Equal(t, "1804194200000000000", storage.USDPerToken["EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99"].Value.String())
	require.Equal(t, "13819996070000000000", storage.USDPerToken["EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"].Value.String())

	// PremiumMultiplier
	require.Equal(t, uint64(1), storage.PremiumMultiplierWeiPerEthByToken["EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd99"])

	// DestChainConfigs
	require.Equal(t, 3, len(storage.DestChainConfigsByChainSelector))

	// Selector: 14767482510784806043
	cfg1 := storage.DestChainConfigsByChainSelector[14767482510784806043]
	require.True(t, cfg1.Config.IsEnabled)
	require.Equal(t, uint32(300000), cfg1.Config.DestGasOverhead)
	require.Equal(t, "14713549000", cfg1.USDPerUnitGas.ExecutionGasPrice.String())

	// Selector: 16015286601757825753
	cfg2 := storage.DestChainConfigsByChainSelector[16015286601757825753]
	require.Equal(t, "4701260146", cfg2.USDPerUnitGas.ExecutionGasPrice.String())

	// Selector: 3478487238524512106
	cfg3 := storage.DestChainConfigsByChainSelector[3478487238524512106]
	require.Equal(t, "470175000000", cfg3.USDPerUnitGas.ExecutionGasPrice.String())
	require.Equal(t, "661379", cfg3.USDPerUnitGas.DataAvailabilityGasPrice.String())
}
