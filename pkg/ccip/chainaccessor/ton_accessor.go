package chainaccessor

import (
	"context"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ccip/pkg/chainaccessor"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/query"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

var ErrNoBindings = errors.New("no bindings found")

type TONAccessor struct {
	lggr          logger.Logger
	chainSelector ccipocr3.ChainSelector
	client        ton.APIClientWrapped
	logPoller     logpoller.Service
	// Note: we might need to update this in the future to map[string][]address.Address
	// to support multi-bind addresses for the price aggregator contract: smartcontractkit/chainlink-ccip@main/pkg/contractreader/extended.go#L77-L79
	bindings   map[string]*address.Address
	bindingsMu sync.RWMutex
	addrCodec  ccipocr3.ChainSpecificAddressCodec
}

var _ ccipocr3.ChainAccessor = (*TONAccessor)(nil)

func NewTONAccessor(
	lggr logger.Logger,
	chainSelector ccipocr3.ChainSelector,
	client ton.APIClientWrapped,
	logPoller logpoller.Service,
	addrCodec ccipocr3.ChainSpecificAddressCodec,
) (ccipocr3.ChainAccessor, error) {
	return &TONAccessor{
		lggr:          lggr,
		chainSelector: chainSelector,
		client:        client,
		logPoller:     logPoller,
		bindings:      make(map[string]*address.Address),
		bindingsMu:    sync.RWMutex{},
		addrCodec:     addrCodec,
	}, nil
}

// Common Accessor methods
func (a *TONAccessor) GetContractAddress(contractName string) ([]byte, error) {
	addr, err := a.getBinding(contractName)
	if err != nil {
		return nil, err
	}
	return addrToBytes(addr), nil
}

func (a *TONAccessor) GetAllConfigsLegacy(ctx context.Context, destChainSelector ccipocr3.ChainSelector, sourceChainSelectors []ccipocr3.ChainSelector) (ccipocr3.ChainConfigSnapshot, map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, error) {
	// Match old behaviour: if a contract isn't bound, we return an empty value so the nodes can achieve consensus on partial config
	// https://github.com/smartcontractkit/chainlink-ccip/blob/a8dbbdbf14a07593de2f0dbe608f8b64d893a6bd/pkg/contractreader/extended.go#L226-L231

	// TODO: pass in addresses we fetched so subsequent fetches don't fail (offramp->feeQuoter etc)
	a.lggr.Debug("GetAllConfigsLegacy")
	var config ccipocr3.ChainConfigSnapshot
	var sourceChainConfigs map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig

	block, err := a.client.CurrentMasterchainInfo(ctx)
	if !errors.Is(err, ErrNoBindings) && err != nil {
		return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get current block: %w", err)
	}

	if a.chainSelector == destChainSelector {
		// we're fetching config on the destination chain (offramp + fee quoter static config + RMN)

		// OffRamp
		offrampStaticConfig, err := a.getOffRampStaticConfig(ctx, block)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get current offramp static config: %w", err)
		}
		// TODO: assert offrampStaticConfig.ChainSelector == destChainSelector as a quick sanity check
		offrampDynamicConfig, err := a.getOffRampDynamicConfig(ctx, block)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get current offramp dynamic config: %w", err)
		}
		config.Offramp = ccipocr3.OfframpConfig{
			// TODO: read OCR config from contract
			CommitLatestOCRConfig: ccipocr3.OCRConfigResponse{},
			ExecLatestOCRConfig:   ccipocr3.OCRConfigResponse{},
			StaticConfig:          offrampStaticConfig,
			DynamicConfig:         offrampDynamicConfig,
		}

		// FeeQuoter
		feeQuoterStaticConfig, err := a.getFeeQuoterStaticConfig(ctx, block)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get current feequoter static config: %w", err)
		}
		config.FeeQuoter = ccipocr3.FeeQuoterConfig{
			StaticConfig: feeQuoterStaticConfig,
		}

		// RMN
		// TODO: RMNProxy should be an implementation detail hidden behind chainAccessor
		config.RMNProxy = ccipocr3.RMNProxyConfig{
			// TODO: point at a rmnremote address/router/offramp to allow fetching curseinfo
		}
		config.RMNRemote = ccipocr3.RMNRemoteConfig{
			// We don't support RMN so return an empty config
		}

		// CurseInfo
		curseInfo, err := a.getCurseInfo(ctx, block)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get curse info: %w", err)
		}
		config.CurseInfo = curseInfo

		sourceChainConfigs, err = a.getOffRampSourceChainConfigs(ctx, block, sourceChainSelectors)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get source chain configs: %w", err)
		}
	} else {
		// we're fetching config on the source chain (onramp + router config)

		// OnRamp
		onRampDynamicConfig, err := a.getOnRampDynamicConfig(ctx, block)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get current onramp dynamic config: %w", err)
		}
		onRampDestChainConfig, err := a.getOnRampDestChainConfig(ctx, block, destChainSelector)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get current onramp dest chain config: %w", err)
		}
		config.OnRamp = ccipocr3.OnRampConfig{
			DynamicConfig:   ccipocr3.GetOnRampDynamicConfigResponse{DynamicConfig: onRampDynamicConfig},
			DestChainConfig: onRampDestChainConfig,
		}

		// TODO use a non-empty address for e2e test before we resolve the chainlink-ccip chain accessor event validation check
		// TODO move the cs_test_helper.go fee token address somewhere else so we can import here rather than redeclar
		var TonTokenAddr = address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001")
		// Router
		config.Router = ccipocr3.RouterConfig{
			// TODO: confirm address.NewAddressNone == zero address if fully written out (0:00000..)
			// Similar to Aptos, TON has no wrapped native, so we treat zero address as the native fee token
			WrappedNativeAddress: addrToBytes(TonTokenAddr),
		}

		// sourceChainConfigs represents sources on the *destination chain* contract, since this is the source chain
		// we'll return an empty map
		sourceChainConfigs = make(map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, 0)
	}
	return config, sourceChainConfigs, nil
}

func (a *TONAccessor) GetChainFeeComponents(ctx context.Context) (ccipocr3.ChainFeeComponents, error) {
	// TODO(NONEVM-2364) implement me
	return ccipocr3.ChainFeeComponents{
		ExecutionFee:        big.NewInt(1),
		DataAvailabilityFee: big.NewInt(1),
	}, nil
}

// Matching CCIP Plugins - default accessor w/ CR behavior
// CCIP contract discovery follows the same two-phase approach for TON:
// 1. Initial binding: Offramp address registered at startup (chainlink-ccip/pkg/reader/ccip.go:113-118)
// 2. Dynamic discovery: Onramp addresses discovered from offramp.SourceChainConfig (ccip.go:644-656)
//
// Key implementation difference:
// - Default Accessor: Wraps ContractReader(CR) - delegates to CR's Bind() for event registration
//   - Sync() calls contractReader.Bind() which registers event filters in EVM/SOL CR
//
// - TON Accessor: Bypasses CR entirely - implements ChainAccessor interface directly
//   - Sync() directly calls bindContractEvent() to register event filters with TON logPoller
//   - Both expose same Sync() interface to CCIPChainReader
func (a *TONAccessor) Sync(ctx context.Context, contractName string, contractAddress ccipocr3.UnknownAddress) error {
	strAddr, err := a.addrCodec.AddressBytesToString(contractAddress)
	if err != nil {
		return fmt.Errorf("failed with addr codec decode: %w", err)
	}
	addr, err := address.ParseAddr(strAddr)
	if err != nil {
		return fmt.Errorf("invalid address: %w", err)
	}

	if err := a.bindContractEvent(ctx, contractName, addr); err != nil {
		return fmt.Errorf("failed to bind contract event: %w", err)
	}

	a.bindingsMu.Lock()
	defer a.bindingsMu.Unlock()
	a.bindings[contractName] = addr

	return nil
}

// TON as source chain methods
func (a *TONAccessor) MsgsBetweenSeqNums(ctx context.Context, dest ccipocr3.ChainSelector, seqNumRange ccipocr3.SeqNumRange) ([]ccipocr3.Message, error) {
	onrampAddr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return nil, fmt.Errorf("OnRamp not bound: %w", err)
	}

	res, err := logpoller.NewQuery[onramp.CCIPMessageSent]().
		WithSource(onrampAddr).
		WithEventSig(hash.CRC32(consts.EventNameCCIPMessageSent)).
		SkipBytes(40). // Skip to DestChainSelector
		FilterBytes(8, query.EQ(binary.BigEndian.AppendUint64(nil, uint64(dest)))).
		FilterBytes(8,
			query.GTE(binary.BigEndian.AppendUint64(nil, uint64(seqNumRange.Start()))),
			query.LTE(binary.BigEndian.AppendUint64(nil, uint64(seqNumRange.End()))),
		).
		OrderBy(query.SortByTxLT, query.ASC).
		Limit(int(seqNumRange.End()-seqNumRange.Start()+1)). //nolint:gosec // conversion is safe in this context
		Execute(ctx, a.logPoller.GetStore())

	if err != nil {
		return nil, fmt.Errorf("failed to query onRamp logs: %w", err)
	}
	a.lggr.Infow("TONAccessor: queried MsgsBetweenSeqNums",
		"numMsgs", len(res.Logs),
		"sourceChainSelector", a.chainSelector,
		"seqNumRange", seqNumRange.String(),
	)

	msgs := make([]ccipocr3.Message, 0)
	for _, log := range res.Logs {
		event := a.convertCCIPMessageSent(&log.TypedData)

		if err := chainaccessor.ValidateSendRequestedEvent(event, a.chainSelector, dest, seqNumRange); err != nil {
			a.lggr.Errorw("validate send requested event", "err", err, "message", event)
			continue
		}
		rawOnrampAddr := codec.ToRawAddr(onrampAddr)
		event.Message.Header.OnRamp = rawOnrampAddr[:]
		event.Message.Header.TxHash = hex.EncodeToString(log.TxHash[:])
		msgs = append(msgs, event.Message)
		a.lggr.Debugw("MsgsBetweenSeqNums: found message and appended it to the output", "seqNum", event.SequenceNumber, "txHash", event.Message.Header.TxHash, "destChainSelector", dest, "sourceChainSelector", a.chainSelector)
	}
	return msgs, nil
}

func (a *TONAccessor) LatestMessageTo(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	onrampAddr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return 0, fmt.Errorf("OnRamp not bound: %w", err)
	}

	res, err := logpoller.NewQuery[onramp.CCIPMessageSent]().
		WithSource(onrampAddr).
		WithEventSig(hash.CRC32(consts.EventNameCCIPMessageSent)).
		SkipBytes(40). // Skip to DestChainSelector
		FilterBytes(8, query.EQ(binary.BigEndian.AppendUint64(nil, uint64(dest)))).
		OrderBy(query.SortByTxLT, query.DESC). // sort by transaction LT new to old
		Limit(1).                              // only get the last one
		Execute(ctx, a.logPoller.GetStore())

	if err != nil {
		return 0, fmt.Errorf("failed to query onRamp logs: %w", err)
	}

	a.lggr.Infow("TONAccessor: LatestMessageTo",
		"numMsgs", len(res.Logs),
		"sourceChainSelector", a.chainSelector,
	)

	if len(res.Logs) > 1 {
		return 0, fmt.Errorf("more than one message found for the latest message query, found: %d", len(res.Logs))
	}
	if len(res.Logs) == 0 {
		return 0, nil
	}

	event := a.convertCCIPMessageSent(&res.Logs[0].TypedData)

	if err := chainaccessor.ValidateSendRequestedEvent(event, a.chainSelector, dest, ccipocr3.NewSeqNumRange(event.Message.Header.SequenceNumber, event.Message.Header.SequenceNumber)); err != nil {
		a.lggr.Errorw("validate send requested event", "err", err, "message", event)
		return 0, fmt.Errorf("message invalid msg %v: %w", event, err)
	}

	return event.SequenceNumber, nil
}

func (a *TONAccessor) getBinding(contractName string) (*address.Address, error) {
	a.bindingsMu.RLock()
	defer a.bindingsMu.RUnlock()

	addr, exists := a.bindings[contractName]
	if !exists {
		return nil, ErrNoBindings
	}

	return addr, nil
}

func (a *TONAccessor) GetExpectedNextSequenceNumber(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	addr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return 0, err
	}
	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to get current block: %w", err)
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "expectedNextSequenceNumber", uint64(dest))
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
	addr, err := a.getBinding(consts.ContractNameFeeQuoter)
	if err != nil {
		return ccipocr3.TimestampedUnixBig{}, err
	}

	addrStr, err := a.addrCodec.AddressBytesToString(rawTokenAddress)
	if err != nil {
		return ccipocr3.TimestampedUnixBig{}, fmt.Errorf("failed with addr codec decode: %w", err)
	}

	tokenAddress, err := address.ParseAddr(addrStr)
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
		Value: timestampedPrice.Value,
		// TODO: u64 -> u32? should we fix the onchain type?
		Timestamp: uint32(timestampedPrice.Timestamp), //nolint:gosec // G115
	}, nil
}

func (a *TONAccessor) GetFeeQuoterDestChainConfig(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.FeeQuoterDestChainConfig, error) {
	addr, err := a.getBinding(consts.ContractNameFeeQuoter)
	if err != nil {
		return ccipocr3.FeeQuoterDestChainConfig{}, err
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
func (a *TONAccessor) CommitReportsGTETimestamp(
	ctx context.Context,
	ts time.Time,
	confidence primitives.ConfidenceLevel,
	limit int,
) ([]ccipocr3.CommitPluginReportWithMeta, error) {
	// double the internal limit for safe filtering
	// TODO: remove, when we only query events with valid merkle root we don't need this
	internalLimit := limit * 2

	offrampAddr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return nil, fmt.Errorf("OffRamp not bound: %w", err)
	}

	res, err := logpoller.NewQuery[offramp.CommitReportAccepted]().
		WithSource(offrampAddr).
		WithEventSig(hash.CRC32(consts.EventNameCommitReportAccepted)).
		// TODO: filter merkle root only
		FilterTimestamp(query.TimestampGTE(ts)).
		OrderBy(query.SortByTxTimestamp, query.ASC).
		Limit(internalLimit).
		Execute(ctx, a.logPoller.GetStore())

	if err != nil {
		return nil, fmt.Errorf("failed to query offramp logs: %w", err)
	}

	a.lggr.Debugw("queried commit reports", "numReports", len(res.Logs),
		"destChain", a.chainSelector,
		"ts", ts,
		"limit", internalLimit,
	)
	reports := a.processCommitReports(res.Logs, ts, limit)
	return reports, nil
}

func (a *TONAccessor) processCommitReports(logs []types.TypedLog[offramp.CommitReportAccepted], ts time.Time, limit int) []ccipocr3.CommitPluginReportWithMeta {
	var reports []ccipocr3.CommitPluginReportWithMeta
	for _, log := range logs {
		ev, err := a.validateCommitReportAcceptedEvent(log, ts)
		if err != nil {
			continue
		}
		a.lggr.Debugw("processing commit report", "report", ev, "item", log)

		mrc := a.processMerkleRoot(ev.MerkleRoot)

		priceUpdates, err := a.processPriceUpdates(ev.PriceUpdates)
		if err != nil {
			a.lggr.Errorw("failed to process price updates", "err", err, "priceUpdates", ev.PriceUpdates)
			continue
		}

		reports = append(reports, ccipocr3.CommitPluginReportWithMeta{
			Report: ccipocr3.CommitPluginReport{
				BlessedMerkleRoots:   []ccipocr3.MerkleRootChain{mrc},
				UnblessedMerkleRoots: []ccipocr3.MerkleRootChain{}, // empty
				PriceUpdates:         priceUpdates,
			},
			Timestamp: log.TxTimestamp,
			// BlockNum:  blockNum, // TODO: populate masterchain block seqno
		})
	}
	a.lggr.Debugw("decoded commit reports", "reports", reports)

	if len(reports) < limit {
		return reports
	}
	return reports[:limit]
}

func (a *TONAccessor) processMerkleRoot(mr ocr.MerkleRoot) ccipocr3.MerkleRootChain {
	return ccipocr3.MerkleRootChain{
		ChainSel:      ccipocr3.ChainSelector(mr.SourceChainSelector),
		OnRampAddress: ccipocr3.UnknownAddress(mr.OnRampAddress[:]),
		SeqNumsRange: ccipocr3.NewSeqNumRange(
			ccipocr3.SeqNum(mr.MinSeqNr),
			ccipocr3.SeqNum(mr.MaxSeqNr),
		),
		MerkleRoot: ccipocr3.Bytes32(mr.MerkleRoot),
	}
}

func (a *TONAccessor) processPriceUpdates(priceUpdates ocr.PriceUpdates) (ccipocr3.PriceUpdates, error) {
	lggr := a.lggr
	updates := ccipocr3.PriceUpdates{
		TokenPriceUpdates: make([]ccipocr3.TokenPrice, 0),
		GasPriceUpdates:   make([]ccipocr3.GasPriceChain, 0),
	}

	for _, tokenPriceUpdate := range priceUpdates.TokenPriceUpdates {
		srcTokenAddr := codec.ToRawAddr(tokenPriceUpdate.SourceToken)
		// TODO: verify codec behavior
		sourceTokenAddrStr, err := a.addrCodec.AddressBytesToString(srcTokenAddr[:])
		if err != nil {
			lggr.Errorw("failed to convert source token address to string", "err", err)
			return updates, err
		}
		updates.TokenPriceUpdates = append(updates.TokenPriceUpdates, ccipocr3.TokenPrice{
			TokenID: ccipocr3.UnknownEncodedAddress(sourceTokenAddrStr),
			Price:   ccipocr3.NewBigInt(tokenPriceUpdate.UsdPerToken),
		})
	}

	for _, gasPriceUpdate := range priceUpdates.GasPriceUpdates {
		updates.GasPriceUpdates = append(updates.GasPriceUpdates, ccipocr3.GasPriceChain{
			ChainSel: ccipocr3.ChainSelector(gasPriceUpdate.DestChainSelector),
			GasPrice: ccipocr3.NewBigInt(gasPriceUpdate.UsdPerUnitGas),
		})
	}

	return updates, nil
}

func (a *TONAccessor) ExecutedMessages(
	ctx context.Context,
	ranges map[ccipocr3.ChainSelector][]ccipocr3.SeqNumRange,
	confidence primitives.ConfidenceLevel,
) (map[ccipocr3.ChainSelector][]ccipocr3.SeqNum, error) {
	// TODO: trim empty ranges from ranges
	// TODO: this can be sanitized from the upper layer
	nonEmptyRangesPerChain := make(map[ccipocr3.ChainSelector][]ccipocr3.SeqNumRange)
	for chain, ranges := range ranges {
		if len(ranges) > 0 {
			nonEmptyRangesPerChain[chain] = ranges
		}
	}

	// TODO: query executed messages from consts.ContractNameOffRamp
	offrampAddr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return nil, fmt.Errorf("OffRamp not bound: %w", err)
	}
	executed := make(map[ccipocr3.ChainSelector][]ccipocr3.SeqNum)

	type ExecutionStateChangedEvent struct {
		// TODO: TBD - from offramp or merkleroot?
	}

	// TODO: currently no support for OR condition, query individually
	for _, ranges := range nonEmptyRangesPerChain {
		for _, seqRange := range ranges {
			_ = seqRange
			// query for each chain/range combination
			res, err := logpoller.NewQuery[ExecutionStateChangedEvent]().
				WithSource(offrampAddr).
				WithEventSig(hash.CRC32(consts.EventNameExecutionStateChanged)).
				// TODO: event structure TBD
				// SkipBytes(32). // Skip to SourceChainSelector field
				// FilterBytes(8, query.EQ(binary.BigEndian.AppendUint64(nil, uint64(chainSelector)))).
				// FilterBytes(8, // SequenceNumber field
				// 	query.GTE(binary.BigEndian.AppendUint64(nil, uint64(seqRange.Start()))),
				// 	query.LTE(binary.BigEndian.AppendUint64(nil, uint64(seqRange.End()))),
				// ).
				// FilterTyped(func(event ExecutionStateChangedEvent) bool {
				// 	// const EXECUTION_STATE_UNTOUCHED: uint8 = 0;
				// 	// const EXECUTION_STATE_IN_PROGRESS: uint8 = 1;
				// 	// const EXECUTION_STATE_SUCCESS: uint8 = 2;
				// 	// const EXECUTION_STATE_FAILURE: uint8 = 3;
				// 	//   return event.State > 0 // only executed states
				// }).
				Execute(ctx, a.logPoller.GetStore())

			if err != nil {
				return nil, err
			}

			for _, log := range res.Logs {
				_ = log
				// TODO: build ExecutionStateChanged event
				// TODO: validate event, skip on failure
				// if err := validateExecutionStateChangedEvent(stateChange, nonEmptyRangesPerChain); err != nil {
				// 	lggr.Errorw("validate execution state changed event",
				// 	"err", err, "stateChange", stateChange)
				// 	continue
				// }
				// TODO: append sequence number
				// executed[chainSelector] = append(executed[chainSelector], log.TypedData.SequenceNumber)
			}
		}
	}

	// TODO: for item in logs, parse ExecutionStateChangedEvent and validate event
	// TODO: we'll need to have local validateExecutionStateChangedEvent?(not public atm)

	// TODO: return executed sequence numbers
	return executed, nil
}

func (a *TONAccessor) NextSeqNum(ctx context.Context, sources []ccipocr3.ChainSelector) (seqNum map[ccipocr3.ChainSelector]ccipocr3.SeqNum, err error) {
	// NOTE: currently unused by ChainAccessor

	// TODO(NONEVM-2365) implement me
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) Nonces(ctx context.Context, query map[ccipocr3.ChainSelector][]ccipocr3.UnknownEncodedAddress) (map[ccipocr3.ChainSelector]map[string]uint64, error) {
	// TON doesn't support out of order, so nonces will always be 0
	nonces := make(map[ccipocr3.ChainSelector]map[string]uint64, len(query))
	for chainSelector, addresses := range query {
		for _, address := range addresses {
			nonces[chainSelector][string(address)] = 0
		}
	}
	return nonces, nil
}

func (a *TONAccessor) GetChainFeePriceUpdate(ctx context.Context, selectors []ccipocr3.ChainSelector) map[ccipocr3.ChainSelector]ccipocr3.TimestampedBig {
	addr, err := a.getBinding(consts.ContractNameFeeQuoter)
	if err != nil {
		a.lggr.Errorw("failed to batch get chain fee price updates", "err", err)
		return nil
	}
	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		a.lggr.Errorw("failed to batch get current block", "err", err)
		return nil
	}
	prices := make(map[ccipocr3.ChainSelector]ccipocr3.TimestampedBig, len(selectors))
	for _, selector := range selectors {
		result, err := a.client.RunGetMethod(ctx, block, addr, "destinationChainGasPrice", uint64(selector))
		if err != nil {
			a.lggr.Errorw("failed to batch get chain fee price updates", "err", err)
			return nil
		}
		value, err := result.Cell(0)
		if err != nil {
			a.lggr.Errorw("failed to batch get chain fee price updates", "err", err)
			return nil
		}
		// HACK: we read the value as Timestamped since the binary layout is compatible, so that we match TimestampedBig (two values packed together)
		var update feequoter.TimestampedPrice
		if err := tlb.LoadFromCell(&update, value.BeginParse()); err != nil {
			a.lggr.Errorw("failed to batch get chain fee price updates", "err", err)
			return nil
		}
		prices[selector] = ccipocr3.TimeStampedBigFromUnix(ccipocr3.TimestampedUnixBig{
			Timestamp: uint32(update.Timestamp), // TODO: downcast?
			Value:     update.Value,
		})
	}
	return prices
}

func (a *TONAccessor) GetLatestPriceSeqNr(ctx context.Context) (uint64, error) {
	addr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return 0, err
	}
	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to get current block: %w", err)
	}
	result, err := a.client.RunGetMethod(ctx, block, addr, "latestPriceSequenceNumber")
	if err != nil {
		return 0, err
	}
	value, err := result.Int(0)
	if err != nil {
		return 0, err
	}
	return value.Uint64(), nil
}
