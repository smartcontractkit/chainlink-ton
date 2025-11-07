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
	"unicode/utf8"

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
		offrampConfig, err := a.GetOffRampConfig(ctx, block)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get current offramp config: %w", err)
		}
		// TODO: assert offrampStaticConfig.ChainSelector == destChainSelector as a quick sanity check
		config.Offramp = offrampConfig

		// FeeQuoter
		feeQuoterStaticConfig, err := a.GetFeeQuoterStaticConfig(ctx, block)
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
		curseInfo, err := a.GetCurseInfo(ctx, block)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get curse info: %w", err)
		}
		config.CurseInfo = curseInfo

		sourceChainConfigs, err = a.GetOffRampSourceChainConfigs(ctx, block, sourceChainSelectors)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get source chain configs: %w", err)
		}
	} else {
		// we're fetching config on the source chain (onramp + router config)

		// OnRamp
		onRampDynamicConfig, err := a.GetOnRampDynamicConfig(ctx, block)
		if !errors.Is(err, ErrNoBindings) && err != nil {
			return ccipocr3.ChainConfigSnapshot{}, nil, fmt.Errorf("failed to get current onramp dynamic config: %w", err)
		}
		onRampDestChainConfig, err := a.GetOnRampDestChainConfig(ctx, block, destChainSelector)
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
	return ccipocr3.ChainFeeComponents{
		ExecutionFee:        big.NewInt(400), // Basechain costs are 400 nanotons (400e-9), and TON has 9 decimals
		DataAvailabilityFee: big.NewInt(0),   // there are no storage fees per tx, instead contracts pay rent
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

// GetTokenPriceUSD returns price per TON, with 18 decimals
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
		Value:     timestampedPrice.Value,
		Timestamp: timestampedPrice.Timestamp,
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
	var cfg feequoter.DestChainConfig
	if err = cfg.FetchResult(ctx, a.client, block, addr, []interface{}{uint64(dest)}); err != nil {
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
		EnforceOutOfOrder:                 true, // NOTE: EnforceOutOfOrder is always true on TON
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
	offrampAddr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return nil, fmt.Errorf("OffRamp not bound: %w", err)
	}

	res, err := logpoller.NewQuery[offramp.CommitReportAccepted]().
		WithSource(offrampAddr).
		WithEventSig(hash.CRC32(consts.EventNameCommitReportAccepted)).
		FilterTimestamp(query.TimestampGTE(ts)).
		// Filter to only get events with MerkleRoot
		// TODO(@jadepark-dev): revisit when we have a persistent log DB implemented: we need bit query for merkle root prefix
		FilterTyped(
			func(event offramp.CommitReportAccepted) bool {
				return event.MerkleRoot != nil
			},
		).
		OrderBy(query.SortByTxTimestamp, query.ASC).
		Limit(limit).
		Execute(ctx, a.logPoller.GetStore())

	if err != nil {
		return nil, fmt.Errorf("failed to query offramp logs: %w", err)
	}

	a.lggr.Debugw("queried commit reports", "numReports", len(res.Logs),
		"destChain", a.chainSelector,
		"ts", ts,
		"limit", limit,
	)
	reports := a.processCommitReports(res.Logs, ts)
	return reports, nil
}

func (a *TONAccessor) processCommitReports(logs []types.TypedLog[offramp.CommitReportAccepted], ts time.Time) []ccipocr3.CommitPluginReportWithMeta {
	reports := make([]ccipocr3.CommitPluginReportWithMeta, 0)
	for _, log := range logs {
		ev, err := a.validateCommitReportAcceptedEvent(log, ts)
		if err != nil {
			continue
		}
		if ev.MerkleRoot == nil {
			a.lggr.Debugw("skipping commit report with no merkle root", "report", ev)
			continue
		}
		a.lggr.Debugw("processing commit report", "report", ev, "item", log)

		mrc := a.processMerkleRoot(ev.MerkleRoot)

		var priceUpdates ccipocr3.PriceUpdates
		if ev.PriceUpdates != nil {
			priceUpdates, err = a.processPriceUpdates(ev.PriceUpdates)
			if err != nil {
				a.lggr.Errorw("failed to process price updates", "err", err, "priceUpdates", ev.PriceUpdates)
				continue
			}
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

	return reports
}

func (a *TONAccessor) processMerkleRoot(mr *ocr.MerkleRoot) ccipocr3.MerkleRootChain {
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

func (a *TONAccessor) processPriceUpdates(priceUpdates *ocr.PriceUpdates) (ccipocr3.PriceUpdates, error) {
	updates := ccipocr3.PriceUpdates{
		TokenPriceUpdates: make([]ccipocr3.TokenPrice, 0, len(priceUpdates.TokenPriceUpdates)),
		GasPriceUpdates:   make([]ccipocr3.GasPriceChain, 0, len(priceUpdates.GasPriceUpdates)),
	}

	for _, tokenPriceUpdate := range priceUpdates.TokenPriceUpdates {
		updates.TokenPriceUpdates = append(updates.TokenPriceUpdates, ccipocr3.TokenPrice{
			TokenID: ccipocr3.UnknownEncodedAddress(tokenPriceUpdate.SourceToken.String()),
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
	// trim empty ranges from rangesPerChain
	// TODO: this is a hack to avoid SQL errors from the chainreader,
	// TODO(@jadepark-dev): revisit when we have a persistent log DB implemented
	nonEmptyRangesPerChain := make(map[ccipocr3.ChainSelector][]ccipocr3.SeqNumRange)
	for chain, ranges := range ranges {
		if len(ranges) > 0 {
			nonEmptyRangesPerChain[chain] = ranges
		}
	}

	if len(nonEmptyRangesPerChain) == 0 {
		a.lggr.Debugw("no sequence numbers to query", "nonEmptyRangesPerChain", nonEmptyRangesPerChain)
		return nil, nil
	}

	// Query executed messages from OffRamp
	offrampAddr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return nil, fmt.Errorf("failed to get OffRamp binding: %w", err)
	}

	executed := make(map[ccipocr3.ChainSelector][]ccipocr3.SeqNum)

	// Query for ExecutionStateChanged events for all chains/ranges
	// TODO(@jadepark-dev): revisit when we have a persistent log DB implemented(should be OR condition with SQL query)
	for chainSelector, ranges := range nonEmptyRangesPerChain {
		for _, seqRange := range ranges {
			a.lggr.Debugw("querying execution state changed events",
				"chainSelector", chainSelector, "seqRange", seqRange)

			res, err := logpoller.NewQuery[offramp.ExecutionStateChanged]().
				WithSource(offrampAddr).
				WithEventSig(hash.CRC32(consts.EventNameExecutionStateChanged)).
				// TODO(@jadepark-dev): revisit when we have a persistent log DB implemented
				FilterTyped(func(event offramp.ExecutionStateChanged) bool {
					// Filter by source chain selector, sequence number range, and execution state
					return event.State > 0 && // IN_PROGRESS=1, SUCCESS=2, FAILURE=3, skip UNTOUCHED=0
						event.SourceChainSelector == uint64(chainSelector) &&
						event.SequenceNumber >= uint64(seqRange.Start()) &&
						event.SequenceNumber <= uint64(seqRange.End())
				}).
				Execute(ctx, a.logPoller.GetStore())

			if err != nil {
				return nil, fmt.Errorf("failed to query offRamp: %w", err)
			}

			for _, log := range res.Logs {
				if err := a.validateExecutionStateChangedEvent(log.TypedData, nonEmptyRangesPerChain); err != nil {
					a.lggr.Errorw("validate execution state changed event",
						"err", err, "stateChange", log.TypedData)
					continue
				}

				executed[ccipocr3.ChainSelector(log.TypedData.SourceChainSelector)] =
					append(executed[ccipocr3.ChainSelector(log.TypedData.SourceChainSelector)],
						ccipocr3.SeqNum(log.TypedData.SequenceNumber))
			}
		}
	}

	return executed, nil
}

// validateExecutionStateChangedEvent validates that the execution state changed event
// is within the requested ranges and has the correct structure
func (a *TONAccessor) validateExecutionStateChangedEvent(
	event offramp.ExecutionStateChanged,
	ranges map[ccipocr3.ChainSelector][]ccipocr3.SeqNumRange,
) error {
	chainSelector := ccipocr3.ChainSelector(event.SourceChainSelector)
	seqNum := ccipocr3.SeqNum(event.SequenceNumber)

	// Check if the chain selector is in our requested ranges
	seqRanges, exists := ranges[chainSelector]
	if !exists {
		return errors.New("source chain of messages was not queries")
	}

	// Check if the sequence number is within any of the requested ranges
	for _, seqRange := range seqRanges {
		if seqNum >= seqRange.Start() && seqNum <= seqRange.End() {
			// Additional validations to match EVM behavior
			if len(event.MessageID) == 0 {
				return errors.New("message ID is zero")
			}
			if event.State == 0 {
				return errors.New("state is zero")
			}
			return nil // Valid
		}
	}

	return errors.New("execution state changed event sequence number is not in the expected range")
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
		nonces[chainSelector] = make(map[string]uint64, len(addresses))
		for _, address := range addresses {
			nonces[chainSelector][string(address)] = 0
		}
	}
	return nonces, nil
}

func (a *TONAccessor) GetChainFeePriceUpdate(ctx context.Context, selectors []ccipocr3.ChainSelector) (map[ccipocr3.ChainSelector]ccipocr3.TimestampedUnixBig, error) {
	// initialize the map with default values for all selectors
	prices := make(map[ccipocr3.ChainSelector]ccipocr3.TimestampedUnixBig, len(selectors))
	addr, err := a.getBinding(consts.ContractNameFeeQuoter)
	if err != nil {
		return nil, err
	}
	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		a.lggr.Warnw("failed to get current block", "err", err)
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	for _, selector := range selectors {
		result, err := a.client.RunGetMethod(ctx, block, addr, "destinationChainGasPrice", uint64(selector))
		// The plugin is built with EVM behaviour in mind: if a value doesn't exist the zero value is returned
		if execError, ok := err.(ton.ContractExecError); ok && execError.Code == int32(feequoter.ErrorUnknownDestChainSelector) { //nolint:errorlint // we're guaranteed to get unwrapped error here
			// TODO revisit the common error code, right now common.UnknownDestChainSelector doesn't match with on-chain
			prices[selector] = ccipocr3.TimestampedUnixBig{
				Timestamp: 0,
				Value:     big.NewInt(0),
			}
			continue
		}
		if err != nil {
			return nil, err
		}

		value, err := result.Cell(0)
		if err != nil {
			return nil, err
		}

		// HACK: we read the value as Timestamped since the binary layout is compatible, so that we match TimestampedBig (two values packed together)
		var update feequoter.TimestampedPrice
		if err := tlb.LoadFromCell(&update, value.BeginParse()); err != nil {
			return nil, fmt.Errorf("failed to decode TimestampedPrice, potentially unsynced gobindings: %w", err)
		}

		prices[selector] = ccipocr3.TimestampedUnixBig{
			Timestamp: update.Timestamp,
			Value:     update.Value,
		}
	}
	return prices, nil
}

func (a *TONAccessor) GetLatestPriceSeqNr(ctx context.Context) (ccipocr3.SeqNum, error) {
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
	return ccipocr3.SeqNum(value.Uint64()), nil
}

func (a *TONAccessor) MessagesByTokenID(ctx context.Context,
	source, dest ccipocr3.ChainSelector,
	tokens map[ccipocr3.MessageTokenID]ccipocr3.RampTokenAmount,
) (map[ccipocr3.MessageTokenID]ccipocr3.Bytes, error) {
	// No CCTP on TON
	return nil, errors.ErrUnsupported
}

// Price reader
func (a *TONAccessor) GetFeedPricesUSD(
	ctx context.Context,
	tokens []ccipocr3.UnknownEncodedAddress,
	tokenInfo map[ccipocr3.UnknownEncodedAddress]ccipocr3.TokenInfo,
) (ccipocr3.TokenPriceMap, error) {
	// Feeds chain lives on EVM
	return nil, errors.ErrUnsupported
}

func (a *TONAccessor) GetFeeQuoterTokenUpdates(
	ctx context.Context,
	tokens []ccipocr3.UnknownAddress,
) (map[ccipocr3.UnknownEncodedAddress]ccipocr3.TimestampedUnixBig, error) {
	// NOTE: Currently, input tokens are mostly LINK and the native token, so batching is not implemented
	// to keep the TON accessor simple. Batching can be added later if needed, such as for performance bottlenecks.
	addr, err := a.getBinding(consts.ContractNameFeeQuoter)
	if err != nil {
		return nil, err
	}
	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	// TODO: decode token addresses here according to chain selector
	prices := make(map[ccipocr3.UnknownEncodedAddress]ccipocr3.TimestampedUnixBig, len(tokens))
	for _, token := range tokens {
		strAddr, err2 := a.addrCodec.AddressBytesToString(token)
		if err2 != nil {
			return nil, fmt.Errorf("failed to AddressBytesToString for encodedTokens: %w", err2)
		}
		addrParsed, err2 := address.ParseAddr(strAddr)
		if err2 != nil {
			return nil, fmt.Errorf("failed to ParseAddr %s for encodedTokens: %w", strAddr, err2)
		}

		var tokenPrice feequoter.TimestampedPrice
		err = tokenPrice.FetchResult(ctx, a.client, block, addr, []interface{}{cell.BeginCell().MustStoreAddr(addrParsed).EndCell().BeginParse()})
		if err != nil {
			// The plugin is built with EVM behaviour in mind: if a value doesn't exist the zero value is returned
			if execError, ok := err.(ton.ContractExecError); ok && execError.Code == int32(feequoter.ErrorTokenNotSupported) { //nolint:errorlint // we're guaranteed to get unwrapped error here
				// TODO revisit the common error code, right now common.TokenNotSupported doesn't match with on-chain
				prices[ccipocr3.UnknownEncodedAddress(strAddr)] = ccipocr3.TimestampedUnixBig{
					Timestamp: 0,
					Value:     big.NewInt(0),
				}
				continue
			}
			return nil, fmt.Errorf("failed to FetchResult for encodedTokens: %w", err)
		}

		price := ccipocr3.TimestampedUnixBig{
			Value:     tokenPrice.Value,
			Timestamp: tokenPrice.Timestamp,
		}

		if !utf8.ValidString(token.String()) {
			return nil, fmt.Errorf("gRPC can't handle non-UTF8 strings: %x", token)
		}
		prices[ccipocr3.UnknownEncodedAddress(strAddr)] = price
	}
	return prices, nil
}
