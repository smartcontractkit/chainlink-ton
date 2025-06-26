package cal

import (
	"context"
	"time"

	"github.com/smartcontractkit/chainlink-ccip/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"
)

type TONChainAccessor struct{}

var _ ccipocr3.ChainAccessor = (*TONChainAccessor)(nil)

func NewChainAccessor(
	lggr logger.Logger,
// LogPollerLite?,
// LiteClient?,
// Entire TONService?,
	addrCodec ccipocr3.AddressCodec,
) (ccipocr3.ChainAccessor, error) {
	return &TONChainAccessor{}, nil
}

func (a *TONChainAccessor) Metadata() ccipocr3.AccessorMetadata {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetContractAddress(contractName string) ([]byte, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetChainFeeComponents(ctx context.Context) (ccipocr3.ChainFeeComponents, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) Sync(ctx context.Context, contractName string, contractAddress ccipocr3.UnknownAddress) error {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) MsgsBetweenSeqNums(ctx context.Context, dest ccipocr3.ChainSelector, seqNumRange ccipocr3.SeqNumRange) ([]ccipocr3.Message, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) LatestMsgSeqNum(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetExpectedNextSequenceNumber(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetTokenPriceUSD(ctx context.Context, address ccipocr3.UnknownAddress) (ccipocr3.TimestampedUnixBig, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetFeeQuoterDestChainConfig(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.FeeQuoterDestChainConfig, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) CommitReportsGTETimestamp(ctx context.Context, ts time.Time, confidence primitives.ConfidenceLevel, limit int) ([]ccipocr3.CommitPluginReportWithMeta, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) ExecutedMessages(ctx context.Context, ranges map[ccipocr3.ChainSelector][]ccipocr3.SeqNumRange, confidence ccipocr3.ConfidenceLevel) (map[ccipocr3.ChainSelector][]ccipocr3.SeqNum, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) NextSeqNum(ctx context.Context, sources []ccipocr3.ChainSelector) (seqNum map[ccipocr3.ChainSelector]ccipocr3.SeqNum, err error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) Nonces(ctx context.Context, addresses map[ccipocr3.ChainSelector][]ccipocr3.UnknownEncodedAddress) (map[ccipocr3.ChainSelector]map[string]uint64, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetChainFeePriceUpdate(ctx context.Context, selectors []ccipocr3.ChainSelector) map[ccipocr3.ChainSelector]ccipocr3.TimestampedBig {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetLatestPriceSeqNr(ctx context.Context) (uint64, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetOffRampConfigDigest(ctx context.Context, pluginType uint8) ([32]byte, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetOffRampSourceChainsConfig(ctx context.Context, sourceChains []ccipocr3.ChainSelector) (map[ccipocr3.ChainSelector]ccipocr3.SourceChainConfig, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetRMNRemoteConfig(ctx context.Context) (ccipocr3.RemoteConfig, error) {
	//TODO implement me
	panic("implement me")
}

func (a *TONChainAccessor) GetRmnCurseInfo(ctx context.Context) (ccipocr3.CurseInfo, error) {
	//TODO implement me
	panic("implement me")
}
