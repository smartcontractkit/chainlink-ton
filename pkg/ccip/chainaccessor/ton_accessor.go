package chainaccessor

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	cciptypes "github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ccip/pkg/chainaccessor"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/query"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

var ErrNoBindings = errors.New("no bindings found")

type TONAccessor struct {
	lggr          logger.Logger
	chainSelector ccipocr3.ChainSelector
	client        ton.APIClientWrapped
	logPoller     logpoller.Service
	bindings      map[string]*address.Address
	bindingsMu    sync.RWMutex
	addrCodec     ccipocr3.ChainSpecificAddressCodec
}

var _ ccipocr3.ChainAccessor = (*TONAccessor)(nil)

func NewTONAccessor(
	lggr logger.Logger,
	chainSelector cciptypes.ChainSelector,
	client ton.APIClientWrapped,
	logPoller logpoller.Service,
	addrCodec ccipocr3.ChainSpecificAddressCodec,
) (ccipocr3.ChainAccessor, error) {
	// TODO: validate state of client and logPoller (should be initialized in NewChain)
	if client == nil {
		return nil, errors.New("client cannot be nil")
	}
	if logPoller == nil {
		return nil, errors.New("logPoller cannot be nil")
	}
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
	// TODO(NONEVM-2364) implement me
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) GetAllConfigsLegacy(ctx context.Context, chainSelector ccipocr3.ChainSelector, srcChains []ccipocr3.ChainSelector) (ccipocr3.ChainConfigSnapshot, map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, error) {
	// TODO(NONEVM-2364) implement me
	return ccipocr3.ChainConfigSnapshot{}, nil, errors.New("not implemented")
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
	a.bindingsMu.Lock()
	defer a.bindingsMu.Unlock()
	a.bindings[contractName] = addr
	return nil
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

// TON as source chain methods
func (a *TONAccessor) MsgsBetweenSeqNums(ctx context.Context, dest ccipocr3.ChainSelector, seqNumRange ccipocr3.SeqNumRange) ([]ccipocr3.Message, error) {
	// get onramp address
	onrampAddr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return nil, fmt.Errorf("OnRamp not bound: %w", err)
	}

	// query TON logs
	res, err := logpoller.NewQuery[onramp.CCIPMessageSent](a.logPoller.GetStore()).
		WithSrcAddress(onrampAddr).
		WithEventSig(hash.CRC32("CCIPMessageSent")).
		WithCellFilter(query.CellFilter{
			Offset:   0,
			Operator: query.EQ,
			Value:    binary.BigEndian.AppendUint64(nil, uint64(dest)),
		}).
		WithCellFilter(query.CellFilter{
			Offset:   8,
			Operator: query.GTE,
			Value:    binary.BigEndian.AppendUint64(nil, uint64(seqNumRange.Start())),
		}).
		WithCellFilter(query.CellFilter{
			Offset:   8,
			Operator: query.LTE,
			Value:    binary.BigEndian.AppendUint64(nil, uint64(seqNumRange.End())),
		}).
		WithSort(query.SortByTxLT, query.ASC).
		WithLimit(int(seqNumRange.End() - seqNumRange.Start() + 1)). //nolint:gosec // conversion is safe in this context
		Execute(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to query onRamp logs: %w", err)
	}
	a.lggr.Infow("queried messages between sequence numbers",
		"numMsgs", len(res.Logs),
		"sourceChainSelector", a.chainSelector,
		"seqNumRange", seqNumRange.String(),
	)

	msgs := make([]cciptypes.Message, 0)
	for _, log := range res.Logs {
		// convert event to generic CCIP event
		event, err := ToGenericSendRequestedEvent(
			&log.ParsedData, // this is already parsed during query
			a.chainSelector,
		)
		if err != nil {
			a.lggr.Errorw("failed to convert event", "err", err, "log", log)
			continue
		}

		// validate event
		if err := chainaccessor.ValidateSendRequestedEvent(event, a.chainSelector, dest, seqNumRange); err != nil {
			a.lggr.Errorw("validate send requested event", "err", err, "message", event)
			continue
		}
		event.Message.Header.OnRamp = ccipocr3.UnknownAddress(log.ParsedData.Message.Receiver)
		event.Message.Header.TxHash = string(log.TxHash[:]) // TODO: add LT?
		msgs = append(msgs, event.Message)
	}

	msgsWithoutDataField := make([]cciptypes.Message, len(msgs))
	for i, msg := range msgs {
		msgsWithoutDataField[i] = msg.CopyWithoutData()
	}

	a.lggr.Debugw("decoded messages between sequence numbers",
		"msgsWithoutDataField", msgsWithoutDataField,
		"sourceChainSelector", a.chainSelector,
		"seqNumRange", seqNumRange.String(),
	)
	a.lggr.Infow("decoded message IDs between sequence numbers",
		// TODO: copied from default accessor, slicelib internal
		// "seqNum.MsgID", slicelib.Map(msgsWithoutDataField, func(m cciptypes.Message) string {
		// 	return fmt.Sprintf("%d.%d", m.Header.SequenceNumber, m.Header.MessageID)
		// }),
		"sourceChainSelector", a.chainSelector,
		"seqNumRange", seqNumRange.String(),
	)
	return msgs, nil
}

func (a *TONAccessor) LatestMessageTo(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	// get onramp address
	onrampAddr, err := a.getBinding(consts.ContractNameOnRamp)
	if err != nil {
		return 0, fmt.Errorf("OnRamp not bound: %w", err)
	}

	res, err := logpoller.NewQuery[onramp.CCIPMessageSent](a.logPoller.GetStore()).
		WithSrcAddress(onrampAddr).
		WithEventSig(hash.CRC32("CCIPMessageSent")).
		WithCellFilter(query.CellFilter{
			Offset:   0,
			Operator: query.EQ,
			Value:    binary.BigEndian.AppendUint64(nil, uint64(dest)),
		}).
		WithSort(query.SortByTxLT, query.DESC). // sort by transaction LT old to new
		WithLimit(1).                           // only get the last one
		Execute(ctx)

	if err != nil {
		return 0, fmt.Errorf("failed to query onRamp logs: %w", err)
	}

	a.lggr.Debugw("queried latest message from source",
		"numMsgs", len(res.Logs),
		"sourceChainSelector", a.chainSelector,
	)
	if len(res.Logs) > 1 {
		return 0, fmt.Errorf("more than one message found for the latest message query, found: %d", len(res.Logs))
	}
	if len(res.Logs) == 0 {
		return 0, nil
	}

	// convert event to generic CCIP event
	event, err := ToGenericSendRequestedEvent(
		&res.Logs[0].ParsedData,
		a.chainSelector,
	)
	if err != nil {
		return 0, fmt.Errorf("failed to convert event: %w", err)
	}
	// validate event
	if err := chainaccessor.ValidateSendRequestedEvent(event, a.chainSelector, dest, cciptypes.NewSeqNumRange(event.Message.Header.SequenceNumber, event.Message.Header.SequenceNumber)); err != nil {
		a.lggr.Errorw("validate send requested event", "err", err, "message", event)
		return 0, fmt.Errorf("message invalid msg %v: %w", event, err)
	}

	return event.SequenceNumber, nil
}

func (a *TONAccessor) GetExpectedNextSequenceNumber(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	// TODO(NONEVM-2364) implement me
	return 0, errors.New("not implemented")
}

func (a *TONAccessor) GetTokenPriceUSD(ctx context.Context, address ccipocr3.UnknownAddress) (ccipocr3.TimestampedUnixBig, error) {
	// TODO(NONEVM-2364) implement me
	return ccipocr3.TimestampedUnixBig{}, errors.New("not implemented")
}

func (a *TONAccessor) GetFeeQuoterDestChainConfig(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.FeeQuoterDestChainConfig, error) {
	// TODO(NONEVM-2364) implement me
	return ccipocr3.FeeQuoterDestChainConfig{}, errors.New("not implemented")
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
