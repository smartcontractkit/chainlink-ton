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

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cciptypes "github.com/smartcontractkit/chainlink-common/pkg/types/ccip"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ccip/pkg/chainaccessor"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-ccip/pkg/logutil"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	lptypes "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
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
	lggr := logutil.WithContextValues(ctx, a.lggr)
	// Match old behaviour: if a contract isn't bound, we return an empty value so the nodes can achieve consensus on partial config
	// https://github.com/smartcontractkit/chainlink-ccip/blob/a8dbbdbf14a07593de2f0dbe608f8b64d893a6bd/pkg/contractreader/extended.go#L226-L231

	// TODO: pass in addresses we fetched so subsequent fetches don't fail (offramp->feeQuoter etc)
	lggr.Debug("GetAllConfigsLegacy")
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

		// Router
		config.Router = ccipocr3.RouterConfig{
			// Similar to Aptos, TON has no wrapped native, so we treat zero address as the native fee token
			WrappedNativeAddress: addrToBytes(tvm.TonTokenAddr),
		}

		// sourceChainConfigs represents sources on the *destination chain* contract, since this is the source chain
		// we'll return an empty map
		sourceChainConfigs = make(map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, 0)
	}
	return config, sourceChainConfigs, nil
}

func (a *TONAccessor) GetChainFeeComponents(ctx context.Context) (ccipocr3.ChainFeeComponents, error) {
	return ccipocr3.ChainFeeComponents{
		// We are using nanoTON instead of compute units, that's why this value is 1.
		// The commit plugin will pick this value and do the math according to
		// https://github.com/smartcontractkit/chainlink-ccip/blob/main/internal/libs/mathslib/calc.go#L105-L114
		// The gas price in USD that is stored in dest chain Fee Quoter will express the value of 1 nanoTON in USD
		// given that the gasLimit is now in nanoTONs
		ExecutionFee:        big.NewInt(1),
		DataAvailabilityFee: big.NewInt(0), // there are no storage fees per tx, instead contracts pay rent
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
	lggr := logutil.WithContextValues(ctx, a.lggr)
	onrampAddr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return nil, fmt.Errorf("OnRamp not bound: %w", err)
	}

	// Filter at database level using byte-level filtering
	// CCIPMessageSent struct layout:
	// - Message: 40 bytes at offset 0 (Message struct)
	// - DestChainSelector: uint64 (8 bytes) at offset 40
	// - SequenceNumber: uint64 (8 bytes) at offset 48
	logs, _, _, err := a.logPoller.NewQuery().
		WithSource(onrampAddr).
		WithEventSig(hash.CRC32(consts.EventNameCCIPMessageSent)).
		WithBocBytes(
			query.SkipBytes(40),
			query.MatchBytes(8, query.WithCondition(binary.BigEndian.AppendUint64(nil, uint64(dest)), primitives.Eq)),
			query.MatchBytes(8,
				query.WithCondition(binary.BigEndian.AppendUint64(nil, uint64(seqNumRange.Start())), primitives.Gte),
				query.WithCondition(binary.BigEndian.AppendUint64(nil, uint64(seqNumRange.End())), primitives.Lte),
			),
		).
		WithLimitAndSort(commonquery.LimitAndSort{
			SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Asc)},
			Limit:  commonquery.CountLimit(uint64(seqNumRange.End() - seqNumRange.Start() + 1)),
		}).
		Execute(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to query onRamp logs: %w", err)
	}
	lggr.Infow("queried messages between sequence numbers",
		"numMsgs", len(logs),
		"sourceChainSelector", a.chainSelector,
		"seqNumRange", seqNumRange.String(),
	)

	// Decode raw logs into typed events
	typedLogs, err := query.DecodedLogs[onramp.CCIPMessageSent](logs)
	if err != nil {
		return nil, fmt.Errorf("failed to decode CCIPMessageSent events: %w", err)
	}

	msgs := make([]ccipocr3.Message, 0)
	for _, typedLog := range typedLogs {
		genericEvent := a.convertCCIPMessageSent(&typedLog.TypedData)

		if err = chainaccessor.ValidateSendRequestedEvent(genericEvent, a.chainSelector, dest, seqNumRange); err != nil {
			lggr.Errorw("validate send requested event", "err", err, "message", genericEvent)
			continue
		}
		rawOnrampAddr := codec.ToRawAddr(onrampAddr)
		genericEvent.Message.Header.OnRamp = rawOnrampAddr[:]
		genericEvent.Message.Header.TxHash = hex.EncodeToString(typedLog.TxHash[:])
		msgs = append(msgs, genericEvent.Message)
	}

	msgsWithoutDataField := make([]ccipocr3.Message, len(msgs))
	for i, msg := range msgs {
		msgsWithoutDataField[i] = msg.CopyWithoutData()
	}

	lggr.Debugw("decoded messages between sequence numbers",
		"msgsWithoutDataField", msgsWithoutDataField,
		"sourceChainSelector", a.chainSelector,
		"seqNumRange", seqNumRange.String(),
	)

	return msgs, nil
}

func (a *TONAccessor) LatestMessageTo(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	lggr := logutil.WithContextValues(ctx, a.lggr)
	onrampAddr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return 0, fmt.Errorf("OnRamp not bound: %w", err)
	}

	destBytes := binary.BigEndian.AppendUint64(nil, uint64(dest))

	// Filter at database level using byte-level filtering
	// CCIPMessageSent struct layout:
	// - Message: 40 bytes at offset 0 (Message struct)
	// - DestChainSelector: uint64 (8 bytes) at offset 40
	// - SequenceNumber: uint64 (8 bytes) at offset 48
	logs, _, _, err := a.logPoller.NewQuery().
		WithSource(onrampAddr).
		WithEventSig(hash.CRC32(consts.EventNameCCIPMessageSent)).
		WithBocBytes(
			query.SkipBytes(40),
			query.MatchBytes(8, query.WithCondition(destBytes, primitives.Eq)),
		).
		WithLimitAndSort(commonquery.LimitAndSort{
			SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Desc)},
			Limit:  commonquery.CountLimit(1),
		}).
		Execute(ctx)

	if err != nil {
		return 0, fmt.Errorf("failed to query onRamp logs: %w", err)
	}

	lggr.Debugw("queried latest message from source",
		"numMsgs", len(logs),
		"sourceChainSelector", a.chainSelector,
	)

	if len(logs) > 1 {
		return 0, fmt.Errorf("more than one message found for the latest message query, found: %d", len(logs))
	}
	if len(logs) == 0 {
		return 0, nil
	}
	log := logs[0]

	var event onramp.CCIPMessageSent
	const skipMagic = true // Always skip magic (opcode in msg) when parsing log cells, we only store message body
	if parseErr := tlb.LoadFromCell(&event, log.Data.BeginParse(), skipMagic); parseErr != nil {
		return 0, fmt.Errorf("failed to decode log at tx %s: %w", hex.EncodeToString(log.TxHash[:]), parseErr)
	}

	genericEvent := a.convertCCIPMessageSent(&event)
	if err := chainaccessor.ValidateSendRequestedEvent(genericEvent, a.chainSelector, dest, ccipocr3.NewSeqNumRange(genericEvent.Message.Header.SequenceNumber, genericEvent.Message.Header.SequenceNumber)); err != nil {
		return 0, fmt.Errorf("message invalid msg %v: %w", genericEvent, err)
	}

	return genericEvent.SequenceNumber, nil
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

	block, err := a.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return ccipocr3.TimestampedUnixBig{}, fmt.Errorf("failed to get current block: %w", err)
	}

	var timestampedPrice feequoter.TimestampedPrice
	// Prepare token address as a slice cell for getter call
	tokenAddressSlice := cell.BeginCell().MustStoreAddr(tokenAddress).EndCell().BeginParse()
	err = timestampedPrice.FetchResult(ctx, a.client, block, addr, []interface{}{tokenAddressSlice})
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
	lggr := logutil.WithContextValues(ctx, a.lggr)
	offrampAddr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return nil, fmt.Errorf("OffRamp not bound: %w", err)
	}

	// Filter at database level using bit-level filtering
	// CommitReportAccepted struct layout:
	// - MerkleRoot presence: 1 bit at offset 0 (1 = has MerkleRoot, 0 = no MerkleRoot)
	// - Report data: variable length following the presence bit
	logs, _, _, err := a.logPoller.NewQuery().
		WithSource(offrampAddr).
		WithEventSig(hash.CRC32(consts.EventNameCommitReportAccepted)).
		WithFields(query.Timestamp(ts, primitives.Gte)).
		WithBocBits(
			query.MatchBit(true), // filter for MerkleRoot prefix: first bit must be 1
		).
		WithLimitAndSort(commonquery.LimitAndSort{
			SortBy: []commonquery.SortBy{query.NewTimestampSort(commonquery.Asc)},
			Limit:  commonquery.CountLimit(uint64(limit)), //nolint:gosec // limit is a reasonable value for query operations
		}).
		Execute(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to query offramp logs: %w", err)
	}

	typedLogs, err := query.DecodedLogs[offramp.CommitReportAccepted](logs)
	if err != nil {
		return nil, fmt.Errorf("failed to decode CommitReportAccepted events: %w", err)
	}

	lggr.Debugw("queried commit reports", "numReports", len(typedLogs),
		"destChain", a.chainSelector,
		"ts", ts,
		"limit", limit,
	)
	reports := a.processCommitReports(ctx, typedLogs, ts)
	return reports, nil
}

func (a *TONAccessor) processCommitReports(ctx context.Context, logs []lptypes.TypedLog[offramp.CommitReportAccepted], ts time.Time) []ccipocr3.CommitPluginReportWithMeta {
	lggr := logutil.WithContextValues(ctx, a.lggr)
	reports := make([]ccipocr3.CommitPluginReportWithMeta, 0)
	for _, log := range logs {
		ev, err := a.validateCommitReportAcceptedEvent(log, ts)
		if err != nil {
			continue
		}
		if ev.MerkleRoot == nil {
			lggr.Debugw("skipping commit report with no merkle root", "report", ev)
			continue
		}
		lggr.Debugw("processing commit report", "report", ev, "item", log)

		mrc := a.processMerkleRoot(ev.MerkleRoot)

		var priceUpdates ccipocr3.PriceUpdates
		if ev.PriceUpdates != nil {
			priceUpdates, err = a.processPriceUpdates(ev.PriceUpdates)
			if err != nil {
				lggr.Errorw("failed to process price updates", "err", err, "priceUpdates", ev.PriceUpdates)
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
			BlockNum:  uint64(log.MasterBlockSeqno),
		})
	}
	lggr.Debugw("decoded commit reports", "reports", reports)

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
		// The plugin still expects the prices to be packed into the single 224 bit value since the EVM contracts
		// don't store split prices the way the TON contracts do so we need to re-pack the prices here again:
		// (DA << 112) | Exec
		packedPrice := feequoter.PackGasPrice(
			gasPriceUpdate.ExecutionGasPrice,
			gasPriceUpdate.DataAvailabilityGasPrice,
		)

		updates.GasPriceUpdates = append(updates.GasPriceUpdates, ccipocr3.GasPriceChain{
			ChainSel: ccipocr3.ChainSelector(gasPriceUpdate.DestChainSelector),
			GasPrice: ccipocr3.NewBigInt(packedPrice),
		})
	}

	return updates, nil
}

func (a *TONAccessor) ExecutedMessages(
	ctx context.Context,
	ranges map[ccipocr3.ChainSelector][]ccipocr3.SeqNumRange,
	confidence primitives.ConfidenceLevel,
) (map[ccipocr3.ChainSelector][]ccipocr3.SeqNum, error) {
	lggr := logutil.WithContextValues(ctx, a.lggr)
	// trim empty ranges from rangesPerChain to avoid unnecessary queries
	nonEmptyRangesPerChain := make(map[ccipocr3.ChainSelector][]ccipocr3.SeqNumRange)
	for chain, seqRange := range ranges {
		if len(ranges) > 0 {
			nonEmptyRangesPerChain[chain] = seqRange
		}
	}

	if len(nonEmptyRangesPerChain) == 0 {
		lggr.Debugw("no sequence numbers to query", "nonEmptyRangesPerChain", nonEmptyRangesPerChain)
		return nil, nil
	}

	// Query executed messages from OffRamp
	offrampAddr, err := a.getBinding(consts.ContractNameOffRamp)
	if err != nil {
		return nil, fmt.Errorf("failed to get OffRamp binding: %w", err)
	}

	executed := make(map[ccipocr3.ChainSelector][]ccipocr3.SeqNum)

	// Query for ExecutionStateChanged events for all chains/ranges
	// TODO(@jadepark-dev): Note: Currently iterating per chain/range - optimize with OR conditions
	for chainSelector, ranges := range nonEmptyRangesPerChain {
		for _, seqRange := range ranges {
			lggr.Debugw("querying execution state changed events",
				"chainSelector", chainSelector, "seqRange", seqRange)

			// Filter at database level using byte-level filtering
			// ExecutionStateChanged struct layout:
			// - SourceChainSelector: uint64 (8 bytes) at offset 0
			// - SequenceNumber: uint64 (8 bytes) at offset 8
			// - MessageID: []byte (32 bytes) at offset 16
			// - State: uint8 (1 byte) at offset 48
			chainSelectorBytes := binary.BigEndian.AppendUint64(nil, uint64(chainSelector))
			seqRangeStartBytes := binary.BigEndian.AppendUint64(nil, uint64(seqRange.Start()))
			seqRangeEndBytes := binary.BigEndian.AppendUint64(nil, uint64(seqRange.End()))
			stateBytes := []byte{byte(cciptypes.ExecutionStateUntouched)}

			logs, _, _, err := a.logPoller.NewQuery().
				WithSource(offrampAddr).
				WithEventSig(hash.CRC32(consts.EventNameExecutionStateChanged)).
				WithBocBytes(
					query.MatchBytes(8, query.WithCondition(chainSelectorBytes, primitives.Eq)), // Filter SourceChainSelector at offset 0
					query.MatchBytes(8,
						query.WithCondition(seqRangeStartBytes, primitives.Gte), // Filter SequenceNumber at offset 8
						query.WithCondition(seqRangeEndBytes, primitives.Lte)),
					query.SkipBytes(32), // Skip MessageID (32 bytes) - cursor now at offset 48
					query.MatchBytes(1, query.WithCondition(stateBytes, primitives.Gt)), // Filter State at offset 48 (> 0 to skip UNTOUCHED=0)
				).
				Execute(ctx)

			if err != nil {
				return nil, fmt.Errorf("failed to query offRamp: %w", err)
			}

			// Parse the raw results into typed events (no filtering needed, already filtered at DB level)
			typedLogs, err := query.DecodedLogs[offramp.ExecutionStateChanged](logs)
			if err != nil {
				lggr.Errorw("failed to decode ExecutionStateChanged events", "err", err)
				continue
			}

			for _, typedLog := range typedLogs {
				if err := a.validateExecutionStateChangedEvent(typedLog.TypedData, nonEmptyRangesPerChain); err != nil {
					lggr.Errorw("validate execution state changed event",
						"err", err, "stateChange", typedLog.TypedData)
					continue
				}

				executed[ccipocr3.ChainSelector(typedLog.TypedData.SourceChainSelector)] =
					append(executed[ccipocr3.ChainSelector(typedLog.TypedData.SourceChainSelector)],
						ccipocr3.SeqNum(typedLog.TypedData.SequenceNumber))
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
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	for _, selector := range selectors {
		var gasPrice feequoter.USDPerUnitGas
		err := gasPrice.FetchResult(ctx, a.client, block, addr, []interface{}{uint64(selector)})
		// The plugin is built with EVM behaviour in mind: if a value doesn't exist the zero value is returned
		if execError, ok := err.(ton.ContractExecError); ok && execError.Code == int32(feequoter.ErrorUnknownDestChainSelector) { //nolint:errorlint // we're guaranteed to get unwrapped error here
			prices[selector] = ccipocr3.TimestampedUnixBig{
				Timestamp: 0,
				Value:     big.NewInt(0),
			}
			continue
		}
		if err != nil {
			return nil, err
		}

		// The plugin expects ExecutionGasPrice and DataAvailabilityGasPrice to be packed into a single big.Int
		// value where DataAvailabilityGasPrice occupies the higher 112 bits and ExecutionGasPrice occupies the
		// lower 112 bits. This allows DA and exec gas prices to be represented in a single value for L2 rollups.
		packedValue := feequoter.PackGasPrice(gasPrice.ExecutionGasPrice, gasPrice.DataAvailabilityGasPrice)

		prices[selector] = ccipocr3.TimestampedUnixBig{
			Timestamp: uint32(gasPrice.Timestamp), //nolint:gosec // G115
			Value:     packedValue,
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
