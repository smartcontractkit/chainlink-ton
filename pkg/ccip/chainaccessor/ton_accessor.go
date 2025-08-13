package chainaccessor

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
)

var ErrNoBindings = errors.New("no bindings found")

type TONAccessor struct {
	lggr       logger.Logger
	client     ton.APIClientWrapped
	logPoller  logpoller.LogPoller
	bindings   map[string]*address.Address
	bindingsMu sync.RWMutex // TODO:
	addrCodec  ccipocr3.ChainSpecificAddressCodec
}

var _ ccipocr3.ChainAccessor = (*TONAccessor)(nil)

func NewTONAccessor(
	lggr logger.Logger,
	client ton.APIClientWrapped,
	logPoller logpoller.LogPoller,
) (ccipocr3.ChainAccessor, error) {
	// TODO: validate state of client and logPoller (should be initialized in NewChain)
	return &TONAccessor{
		lggr:       lggr,
		client:     client,
		logPoller:  logPoller,
		bindings:   make(map[string]*address.Address),
		bindingsMu: sync.RWMutex{},
		addrCodec:  codec.AddressCodec{},
	}, nil
}

// Common Accessor methods
func (a *TONAccessor) GetContractAddress(contractName string) ([]byte, error) {
	// TODO(NONEVM-2364) implement me
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) GetAllConfigLegacySnapshot(ctx context.Context) (ccipocr3.ChainConfigSnapshot, error) {
	// Match old behaviour: if a contract isn't bound, we return an empty value so the nodes can achieve consensus on partial config
	// https://github.com/smartcontractkit/chainlink-ccip/blob/a8dbbdbf14a07593de2f0dbe608f8b64d893a6bd/pkg/contractreader/extended.go#L226-L231

	// TODO: pass in addresses we fetched so subsequent fetches don't fail (offramp->feeQuoter etc)

	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != ErrNoBindings && err != nil {
		return ccipocr3.ChainConfigSnapshot{}, fmt.Errorf("failed to get current block: %w", err)
	}

	offrampDynamicConfig, err := a.getOffRampDynamicConfig(ctx)
	if err != ErrNoBindings && err != nil {
		return ccipocr3.ChainConfigSnapshot{}, fmt.Errorf("failed to get current offramp dynamic config: %w", err)
	}

	offrampStaticConfig, err := a.getOffRampStaticConfig(ctx)
	if err != ErrNoBindings && err != nil {
		return ccipocr3.ChainConfigSnapshot{}, fmt.Errorf("failed to get current offramp static config: %w", err)
	}

	feeQuoterStaticConfig, err := a.getFeeQuoterStaticConfig(ctx, block)
	if err != ErrNoBindings && err != nil {
		return ccipocr3.ChainConfigSnapshot{}, fmt.Errorf("failed to get current feequoter static config: %w", err)
	}

	onRampDynamicConfig, err := a.getOnRampDynamicConfig(ctx, block)
	if err != ErrNoBindings && err != nil {
		return ccipocr3.ChainConfigSnapshot{}, fmt.Errorf("failed to get current onramp dynamic config: %w", err)
	}

	curseInfo, err := a.getCurseInfo(ctx, block)
	if err != ErrNoBindings && err != nil {
		return ccipocr3.ChainConfigSnapshot{}, fmt.Errorf("failed to get curse info: %w", err)
	}
	// a.getOnRampDestChainConfig(ctx, block, dest)

	return ccipocr3.ChainConfigSnapshot{
		Offramp: ccipocr3.OfframpConfig{
			// TODO: read OCR config from contract
			CommitLatestOCRConfig: ccipocr3.OCRConfigResponse{},
			ExecLatestOCRConfig:   ccipocr3.OCRConfigResponse{},
			StaticConfig:          offrampStaticConfig,
			DynamicConfig:         offrampDynamicConfig,
		},
		FeeQuoter: ccipocr3.FeeQuoterConfig{
			StaticConfig: feeQuoterStaticConfig,
		},
		OnRamp: ccipocr3.OnRampConfig{
			DynamicConfig: ccipocr3.GetOnRampDynamicConfigResponse{
				DynamicConfig: onRampDynamicConfig,
			},
			// TODO:
			DestChainConfig: ccipocr3.OnRampDestChainConfig{},
		},
		Router: ccipocr3.RouterConfig{
			// TODO: confirm address.NewAddressNone == zero address if fully written out (0:00000..)
			// Similar to Aptos, TON has no wrapped native, so we treat zero address as the native fee token
			WrappedNativeAddress: addrToBytes(address.NewAddressNone()),
		},
		RMNProxy: ccipocr3.RMNProxyConfig{
			// TODO: point at a rmnremote address/router/offramp to allow fetching curseinfo
		},
		RMNRemote: ccipocr3.RMNRemoteConfig{
			// We don't support RMN so return an empty config
		},
		CurseInfo: curseInfo,
	}, nil
}

func (a *TONAccessor) GetChainFeeComponents(ctx context.Context) (ccipocr3.ChainFeeComponents, error) {
	// TODO(NONEVM-2364) implement me
	return ccipocr3.ChainFeeComponents{}, errors.New("not implemented")
}

func (a *TONAccessor) Sync(ctx context.Context, contractName string, contractAddress ccipocr3.UnknownAddress) error {
	strAddr, err := a.addrCodec.AddressBytesToString(contractAddress)
	if err != nil {
		return fmt.Errorf("invalid address: %w", err)
	}
	addr, err := address.ParseAddr(strAddr)
	if err != nil {
		return fmt.Errorf("invalid address: %w", err)
	}
	a.bindings[contractName] = addr
	return nil
}

// TON as source chain methods
func (a *TONAccessor) MsgsBetweenSeqNums(ctx context.Context, dest ccipocr3.ChainSelector, seqNumRange ccipocr3.SeqNumRange) ([]ccipocr3.Message, error) {
	// TODO(NONEVM-2364) implement me
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) LatestMessageTo(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	// TODO(NONEVM-2364) implement me
	return 0, errors.New("not implemented")
}

func (a *TONAccessor) GetExpectedNextSequenceNumber(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	addr, exists := a.bindings[consts.ContractNameOnRamp]
	if !exists {
		return 0, ErrNoBindings
	}
	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to get current block: %w", err)
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "tokenPrice", dest)
	if err != nil {
		return 0, err
	}
	value, err := result.Int(0)
	if err != nil {
		return 0, err
	}
	return ccipocr3.SeqNum(value.Uint64()), nil
}

func (a *TONAccessor) GetTokenPriceUSD(ctx context.Context, rawTokenAddress ccipocr3.UnknownAddress) (ccipocr3.TimestampedUnixBig, error) {
	addr, exists := a.bindings[consts.ContractNameFeeQuoter]
	if !exists {
		return ccipocr3.TimestampedUnixBig{}, ErrNoBindings
	}

	tokenAddress, err := address.ParseAddr(base64.RawURLEncoding.EncodeToString(rawTokenAddress))
	if err != nil {
		return ccipocr3.TimestampedUnixBig{}, fmt.Errorf("invalid address: %w", err)
	}
	// RunGetMethod isn't happy with address inputs, convert to a slice first
	tokenAddressSlice := cell.BeginCell().MustStoreAddr(tokenAddress).EndCell().BeginParse()

	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return ccipocr3.TimestampedUnixBig{}, fmt.Errorf("failed to get current block: %w", err)
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "tokenPrice", tokenAddressSlice)
	if err != nil {
		return ccipocr3.TimestampedUnixBig{}, err
	}
	var timestampedPrice feequoter.TimestampedPrice
	err = timestampedPrice.FromResult(result)
	if err != nil {
		return ccipocr3.TimestampedUnixBig{}, err
	}
	return ccipocr3.TimestampedUnixBig{
		Value:     timestampedPrice.Value,
		Timestamp: uint32(timestampedPrice.Timestamp), // TODO: u64 -> u32?
	}, nil
}

func (a *TONAccessor) GetFeeQuoterDestChainConfig(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.FeeQuoterDestChainConfig, error) {
	addr, exists := a.bindings[consts.ContractNameFeeQuoter]
	if !exists {
		return ccipocr3.FeeQuoterDestChainConfig{}, ErrNoBindings
	}
	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return ccipocr3.FeeQuoterDestChainConfig{}, fmt.Errorf("failed to get current block: %w", err)
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "destChainConfig", uint64(dest))
	if err != nil {
		return ccipocr3.FeeQuoterDestChainConfig{}, err
	}
	var cfg feequoter.DestChainConfig
	if err = cfg.FromResult(result); err != nil {
		return ccipocr3.FeeQuoterDestChainConfig{}, err
	}
	return ccipocr3.FeeQuoterDestChainConfig{
		IsEnabled:                         cfg.IsEnabled,
		MaxNumberOfTokensPerMsg:           cfg.MaxNumberOfTokensPerMsg,
		MaxDataBytes:                      cfg.MaxDataBytes,
		MaxPerMsgGasLimit:                 cfg.MaxPerMsgGasLimit,
		DestGasOverhead:                   cfg.DestGasOverhead,
		DestGasPerPayloadByteBase:         uint32(cfg.DestGasPerPayloadByteBase),
		DestGasPerPayloadByteHigh:         uint32(cfg.DestGasPerPayloadByteHigh),
		DestGasPerPayloadByteThreshold:    uint32(cfg.DestGasPerPayloadByteThreshold),
		DestDataAvailabilityOverheadGas:   cfg.DestDataAvailabilityOverheadGas,
		DestGasPerDataAvailabilityByte:    cfg.DestGasPerDataAvailabilityByte,
		DestDataAvailabilityMultiplierBps: cfg.DestDataAvailabilityMultiplierBps,
		DefaultTokenFeeUSDCents:           cfg.DefaultTokenFeeUsdCents,
		DefaultTokenDestGasOverhead:       cfg.DefaultTokenDestGasOverhead,
		DefaultTxGasLimit:                 cfg.DefaultTxGasLimit,
		GasMultiplierWeiPerEth:            cfg.GasMultiplierWeiPerEth,
		NetworkFeeUSDCents:                cfg.NetworkFeeUsdCents,
		GasPriceStalenessThreshold:        cfg.GasPriceStalenessThreshold,
		EnforceOutOfOrder:                 cfg.EnforceOutOfOrder,
		ChainFamilySelector:               [4]byte(binary.BigEndian.AppendUint32(nil, cfg.ChainFamilySelector)),
	}, nil
}

// TON as destination chain methods
func (a *TONAccessor) CommitReportsGTETimestamp(ctx context.Context, ts time.Time, confidence primitives.ConfidenceLevel, limit int) ([]ccipocr3.CommitPluginReportWithMeta, error) {
	// TODO(NONEVM-2365) implement me
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) ExecutedMessages(ctx context.Context, ranges map[ccipocr3.ChainSelector][]ccipocr3.SeqNumRange, confidence primitives.ConfidenceLevel) (map[ccipocr3.ChainSelector][]ccipocr3.SeqNum, error) {
	// TODO(NONEVM-2365) implement me
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) NextSeqNum(ctx context.Context, sources []ccipocr3.ChainSelector) (seqNum map[ccipocr3.ChainSelector]ccipocr3.SeqNum, err error) {
	// TODO(NONEVM-2365) implement me
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) Nonces(ctx context.Context, addresses map[ccipocr3.ChainSelector][]ccipocr3.UnknownEncodedAddress) (map[ccipocr3.ChainSelector]map[string]uint64, error) {
	// TODO(NONEVM-2365) implement me
	// Return 0 nonces for all chains for now
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) GetChainFeePriceUpdate(ctx context.Context, selectors []ccipocr3.ChainSelector) map[ccipocr3.ChainSelector]ccipocr3.TimestampedBig {
	// TODO(NONEVM-2365) implement me
	return nil
}

func (a *TONAccessor) GetLatestPriceSeqNr(ctx context.Context) (uint64, error) {
	// TODO(NONEVM-2365) implement me
	return 0, errors.New("not implemented")
}

func (a *TONAccessor) GetRMNCurseInfo(ctx context.Context) (ccipocr3.CurseInfo, error) {
	// TODO(NONEVM-2365) implement me
	return ccipocr3.CurseInfo{}, errors.New("not implemented")
}
