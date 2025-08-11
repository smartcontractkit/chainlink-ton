package chainaccessor

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
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

type TONAccessor struct {
	lggr      logger.Logger
	client    ton.APIClientWrapped
	logPoller logpoller.LogPoller
	bindings  map[string]*address.Address
	addrCodec ccipocr3.ChainSpecificAddressCodec
}

var _ ccipocr3.ChainAccessor = (*TONAccessor)(nil)

func NewTONAccessor(
	lggr logger.Logger,
	client ton.APIClientWrapped,
	logPoller logpoller.LogPoller,
) (ccipocr3.ChainAccessor, error) {
	// TODO: validate state of client and logPoller (should be initialized in NewChain)
	return &TONAccessor{
		lggr:      lggr,
		client:    client,
		logPoller: logPoller,
		bindings:  make(map[string]*address.Address),
		addrCodec: codec.AddressCodec{},
	}, nil
}

// Common Accessor methods
func (a *TONAccessor) GetContractAddress(contractName string) ([]byte, error) {
	// TODO(NONEVM-2364) implement me
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) GetAllConfigLegacySnapshot(ctx context.Context) (ccipocr3.ChainConfigSnapshot, error) {
	// fetch offramp first to get router addr and so on
	// TODO: call Sync in between? we don't want to trust addresses permanently before consensus though
	// problem is, we want to agree on addresses/config in stages so things don't get invalidated
	// for now: implement skipping due to no bindings https://github.com/smartcontractkit/chainlink-ccip/blob/a8dbbdbf14a07593de2f0dbe608f8b64d893a6bd/pkg/contractreader/extended.go#L226-L231

	return ccipocr3.ChainConfigSnapshot{
		Offramp:   ccipocr3.OfframpConfig{},
		FeeQuoter: ccipocr3.FeeQuoterConfig{},
		OnRamp:    ccipocr3.OnRampConfig{},
		Router: ccipocr3.RouterConfig{
			WrappedNativeAddress: ccipocr3.Bytes{}, // there is no wrapped native on TON so we handle 0x0
		},
		RMNProxy:  ccipocr3.RMNProxyConfig{},
		RMNRemote: ccipocr3.RMNRemoteConfig{},
		CurseInfo: ccipocr3.CurseInfo{},
	}, errors.New("not implemented")
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
	// TODO(NONEVM-2364) implement me
	return nil, errors.New("not implemented")
}

func (a *TONAccessor) LatestMessageTo(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	// TODO(NONEVM-2364) implement me
	return 0, errors.New("not implemented")
}

func (a *TONAccessor) GetExpectedNextSequenceNumber(ctx context.Context, dest ccipocr3.ChainSelector) (ccipocr3.SeqNum, error) {
	addr, ok := a.bindings[consts.ContractNameOnRamp]
	if !ok {
		return 0, errors.New("OnRamp not bound")
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
	addr, ok := a.bindings[consts.ContractNameFeeQuoter]
	if !ok {
		return ccipocr3.TimestampedUnixBig{}, errors.New("FeeQuoter not bound")
	}

	// TODO: addrCodec doesn't help us here since we want a TON address type, not bytes/string
	tokenAddress, err := address.ParseAddr(base64.RawURLEncoding.EncodeToString(rawTokenAddress))
	if err != nil {
		return ccipocr3.TimestampedUnixBig{}, fmt.Errorf("invalid address: %w", err)
	}
	// TODO: RunGetMethod isn't happy with address inputs, convert to a slice first
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
	// consts.ContractNameFeeQuoter
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
