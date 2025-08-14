package chainaccessor

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ccip/pkg/chainaccessor"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	cciptypes "github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/query"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

type TONAccessor struct {
	lggr          logger.Logger
	chainSelector cciptypes.ChainSelector
	client        ton.APIClientWrapped
	logPoller     logpoller.Service
	bindings      map[string]*address.Address
	addrCodec     codec.AddressCodec
}

var _ ccipocr3.ChainAccessor = (*TONAccessor)(nil)

func NewTONAccessor(
	lggr logger.Logger,
	chainSelector cciptypes.ChainSelector,
	client ton.APIClientWrapped,
	logPoller logpoller.Service,
	addrCodec ccipocr3.AddressCodec,
) (ccipocr3.ChainAccessor, error) {
	// TODO: validate state of client and logPoller (should be initialized in NewChain)
	if client == nil {
		return nil, errors.New("client cannot be nil")
	}
	if logPoller == nil {
		return nil, errors.New("logPoller cannot be nil")
	}
	return &TONAccessor{
		lggr:      lggr,
		client:    client,
		logPoller: logPoller,
		bindings:  make(map[string]*address.Address),
		addrCodec: codec.AddressCodec{}, // TODO: AddressCodec doesn't match the ccipocr3.AddressCodec interface
	}, nil
}

// Common Accessor methods
func (a *TONAccessor) GetContractAddress(contractName string) ([]byte, error) {
	// TODO(NONEVM-2364) implement me
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) GetAllConfigLegacySnapshot(ctx context.Context) (ccipocr3.ChainConfigSnapshot, error) {
	// TODO(NONEVM-2364) implement me
	return ccipocr3.ChainConfigSnapshot{}, errors.New("not implemented")
}

func (a *TONAccessor) GetChainFeeComponents(ctx context.Context) (ccipocr3.ChainFeeComponents, error) {
	// TODO(NONEVM-2364) implement me
	return ccipocr3.ChainFeeComponents{}, errors.New("not implemented")
}

func (a *TONAccessor) Sync(ctx context.Context, contractName string, contractAddress ccipocr3.UnknownAddress) error {
	addr, err := address.ParseAddr(base64.RawURLEncoding.EncodeToString(contractAddress))
	if err != nil {
		return fmt.Errorf("invalid address: %w", err)
	}
	a.bindings[contractName] = addr
	return nil
}

// TON as source chain methods
func (a *TONAccessor) MsgsBetweenSeqNums(ctx context.Context, dest ccipocr3.ChainSelector, seqNumRange ccipocr3.SeqNumRange) ([]ccipocr3.Message, error) {

	// TODO: get contract address
	onrampAddr, ok := a.bindings[consts.ContractNameOnRamp]
	if !ok {
		return nil, errors.New("OnRamp not bound")
	}

	// Create byte filters for querying CCIPMessageSent events
	destFilter := query.CellFilter{
		Offset:   0,
		Operator: query.EQ,
		Value:    binary.BigEndian.AppendUint64(nil, uint64(dest)),
	}

	startFilter := query.CellFilter{
		Offset:   8,
		Operator: query.GTE,
		Value:    binary.BigEndian.AppendUint64(nil, uint64(seqNumRange.Start())),
	}

	endFilter := query.CellFilter{
		Offset:   8,
		Operator: query.LTE,
		Value:    binary.BigEndian.AppendUint64(nil, uint64(seqNumRange.End())),
	}

	res, err := logpoller.NewQuery[onramp.CCIPMessageSent](a.logPoller.GetStore()).
		WithSrcAddress(onrampAddr).
		WithEventSig(hash.CRC32("CCIPMessageSent")).
		WithCellFilter(destFilter).
		WithCellFilter(startFilter).
		WithCellFilter(endFilter).
		WithSort(query.SortByTxLT, query.ASC).
		WithLimit(int(seqNumRange.End() - seqNumRange.Start() + 1)). //nolint:gosec // conversion is safe in this context
		Execute(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch logs: %w", err)
	}
	a.lggr.Infow("queried messages between sequence numbers",
		"numMsgs", len(res.Events),
		"sourceChainSelector", a.chainSelector,
		"seqNumRange", seqNumRange.String(),
	)

	msgs := make([]cciptypes.Message, 0)
	for i, event := range res.Events {

		// Get the corresponding log entry
		log := res.Logs[i]

		// convert event to generic CCIP message
		rawOnrampAddr := codec.ToRawAddr(onrampAddr)
		msg, err := ToGenericCCIPMessage(
			&event.Message,
			a.chainSelector,
			cciptypes.ChainSelector(event.DestChainSelector),
			cciptypes.SeqNum(event.SequenceNumber),
			cciptypes.UnknownAddress(rawOnrampAddr[:]),
			string(log.TxHash[:]), // TODO: add LT
			a.addrCodec,
		)
		if err != nil {
			a.lggr.Errorw("failed to convert event", "err", err, "event", event, "log", log)
			continue
		}

		// validate event
		// TODO: fix msg type source
		genericEvent := &chainaccessor.SendRequestedEvent{
			DestChainSelector: cciptypes.ChainSelector(event.DestChainSelector),
			SequenceNumber:    cciptypes.SeqNum(event.SequenceNumber),
			Message:           msg,
		}
		if err := chainaccessor.ValidateSendRequestedEvent(msg, a.chainSelector, dest, seqNumRange); err != nil {
			lggr.Errorw("validate send requested event", "err", err, "message", msg)
			continue
		}

		msgs = append(msgs, msg)
	}

	// TODO(NONEVM-2364) implement me
	// TODO: validate event
	// TODO: replace header
	// TODO: return msgs
	return msgs, nil
}

func (a *TONAccessor) LatestMessageTo(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	// TODO(NONEVM-2364) implement me
	return 0, errors.New("not implemented")
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
