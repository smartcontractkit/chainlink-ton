package cal

import (
	"context"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/relay"
)

type TONChainAccessor struct {
	lggr  logger.Logger
	chain relay.Chain
}

var _ ccipocr3.ChainAccessor = (*TONChainAccessor)(nil)

func NewChainAccessor(
	lggr logger.Logger,
	chain relay.Chain,
	addrCodec ccipocr3.AddressCodec,
) (ccipocr3.ChainAccessor, error) {
	// TODO: initialization...
	// ctx := context.Background()
	// client, err := chain.GetClient(ctx)
	// err := chain.LogPoller().Start(ctx)
	return &TONChainAccessor{
		lggr:  lggr,
		chain: chain,
	}, nil
}

// Common Accessor methods
func (a *TONChainAccessor) GetContractAddress(contractName string) ([]byte, error) {
	//TODO(NONEVM-2364) implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetAllConfigLegacySnapshot(ctx context.Context) (ccipocr3.ChainConfigSnapshot, error) {
	//TODO(NONEVM-2364) implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetChainFeeComponents(ctx context.Context) (ccipocr3.ChainFeeComponents, error) {
	//TODO(NONEVM-2364) implement me
	panic("implement me")
}

func (a *TONChainAccessor) Sync(ctx context.Context, contractName string, contractAddress ccipocr3.UnknownAddress) error {
	//TODO(NONEVM-2364) implement me
	panic("implement me")
}

// TON as source chain methods
func (a *TONChainAccessor) MsgsBetweenSeqNums(ctx context.Context, dest ccipocr3.ChainSelector, seqNumRange ccipocr3.SeqNumRange) ([]ccipocr3.Message, error) {
	//TODO(NONEVM-2364) implement me

	panic("implement me")
}

func (a *TONChainAccessor) LatestMessageTo(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	//TODO(NONEVM-2364) implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetExpectedNextSequenceNumber(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	//TODO(NONEVM-2364) implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetTokenPriceUSD(ctx context.Context, address ccipocr3.UnknownAddress) (ccipocr3.TimestampedUnixBig, error) {
	//TODO(NONEVM-2364) implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetFeeQuoterDestChainConfig(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.FeeQuoterDestChainConfig, error) {
	//TODO(NONEVM-2364) implement me
	panic("implement me")
}

// TON as destination chain methods
func (a *TONChainAccessor) CommitReportsGTETimestamp(ctx context.Context, ts time.Time, confidence primitives.ConfidenceLevel, limit int) ([]ccipocr3.CommitPluginReportWithMeta, error) {
	//TODO(NONEVM-2365) implement me
	panic("implement me")
}

func (a *TONChainAccessor) ExecutedMessages(ctx context.Context, ranges map[ccipocr3.ChainSelector][]ccipocr3.SeqNumRange, confidence primitives.ConfidenceLevel) (map[ccipocr3.ChainSelector][]ccipocr3.SeqNum, error) {
	//TODO(NONEVM-2365) implement me
	panic("implement me")
}

func (a *TONChainAccessor) NextSeqNum(ctx context.Context, sources []ccipocr3.ChainSelector) (seqNum map[ccipocr3.ChainSelector]ccipocr3.SeqNum, err error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) Nonces(ctx context.Context, addresses map[ccipocr3.ChainSelector][]ccipocr3.UnknownEncodedAddress) (map[ccipocr3.ChainSelector]map[string]uint64, error) {
	//TODO(NONEVM-2365) implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetChainFeePriceUpdate(ctx context.Context, selectors []ccipocr3.ChainSelector) map[ccipocr3.ChainSelector]ccipocr3.TimestampedBig {
	//TODO(NONEVM-2365) implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetLatestPriceSeqNr(ctx context.Context) (uint64, error) {
	//TODO(NONEVM-2365) implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetRMNCurseInfo(ctx context.Context) (ccipocr3.CurseInfo, error) {
	//TODO(NONEVM-2365) implement me
	panic("implement me")
}
