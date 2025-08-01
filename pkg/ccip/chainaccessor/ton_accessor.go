package chainaccessor

import (
	"context"
	"errors"
	"time"

	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/relay"
)

type TONAccessor struct {
	lggr      logger.Logger
	client    *ton.APIClient   // for liteclient queries for contract state
	logPoller *relay.LogPoller // for stored event logs
}

var _ ccipocr3.ChainAccessor = (*TONAccessor)(nil)

func NewTONAccessor(
	lggr logger.Logger,
	client *ton.APIClient, // TODO: or ton.APIClientWrapped, based on the chain implementation
	logPoller *relay.LogPoller,
	addrCodec ccipocr3.AddressCodec,
) (ccipocr3.ChainAccessor, error) {
	// TODO: validate state of client and logPoller (should be initialized in NewChain)
	return &TONAccessor{
		lggr:      lggr,
		client:    client,
		logPoller: logPoller,
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
	// TODO(NONEVM-2364) implement me
	return errors.New("not implemented")
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
