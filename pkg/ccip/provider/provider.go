package provider

import (
	"context"
	"fmt"
	"sync"

	"github.com/smartcontractkit/libocr/offchainreporting2plus/ocr3types"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

var _ commontypes.CCIPProvider = &Provider{}

const (
	CCIPProviderName      = "TONCCIPProvider"
	CCIPPluginTypeCommit  = 0
	CCIPPluginTypeExecute = 1
)

type Provider struct {
	lggr  logger.Logger
	ca    ccipocr3.ChainAccessor
	ct    ocr3types.ContractTransmitter[[]byte]
	codec ccipocr3.Codec

	wg sync.WaitGroup
	services.StateMachine
}

func NewCCIPProvider(
	lggr logger.Logger,
	chainSelector ccipocr3.ChainSelector,
	client ton.APIClientWrapped,
	txm txm.TxManager,
	logPoller logpoller.Service,
	cargs commontypes.CCIPProviderArgs,
) (*Provider, error) {
	// Validate offramp address
	addressCodec := codec.NewAddressCodec()
	var offRampAddrStr string
	var err error

	// NOTE: provider can still be initialized with an EVM offramp address, and AddressBytesToString will fail on addresses with len=20
	// technically we only need the chainwriter to do fee estimation so this doesn't matter and we can use a zero address
	// TODO: Should we even build the rest of the provider? Or just initialize the accessor with just the estimator.
	if len(cargs.OffRampAddress) == tvm.AddressLength {
		offRampAddrStr, err = addressCodec.AddressBytesToString(cargs.OffRampAddress)
		if err != nil {
			return nil, fmt.Errorf("failed to decode TON offRamp address: %w", err)
		}
	} else {
		// EVM address provided - use zero address as placeholder
		lggr.Debug("EVM offramp address provided to TON provider, using zero address placeholder",
			"providedLength", len(cargs.OffRampAddress),
			"expectedLength", tvm.AddressLength)
		// Use a zero TON address as placeholder
		offRampAddrStr = tvm.ZeroAddressStr
	}

	var ct ocr3types.ContractTransmitter[[]byte]
	switch cargs.PluginType {
	case CCIPPluginTypeCommit:
		ct, err = ocr.NewCCIPTransmitter(txm, lggr, offRampAddrStr, ocr.CommitCallData)
		if err != nil {
			return nil, fmt.Errorf("failed to create a CCIP ContractTransmitter for commit plugin: %w", err)
		}

	case CCIPPluginTypeExecute:
		ct, err = ocr.NewCCIPTransmitter(txm, lggr, offRampAddrStr, ocr.ExecuteCallData)
		if err != nil {
			return nil, fmt.Errorf("failed to create a CCIP ContractTransmitter for execute plugin: %w", err)
		}
	default:
		return nil, fmt.Errorf("unknown plugin type: %d", cargs.PluginType)
	}

	c := ccipocr3.Codec{
		ChainSpecificAddressCodec: addressCodec,
		CommitPluginCodec:         codec.NewCommitPluginCodecV1(),
		ExecutePluginCodec:        codec.NewExecutePluginCodecV1(cargs.ExtraDataCodecBundle),
		TokenDataEncoder:          codec.NewTokenDataEncoder(),
		SourceChainExtraDataCodec: codec.NewExtraDataDecoder(),
	}

	ca, err := chainaccessor.NewTONAccessor(lggr, chainSelector, client, logPoller, c.ChainSpecificAddressCodec)
	if err != nil {
		return nil, fmt.Errorf("failed to create TON Accessor: %w", err)
	}

	lggr.Info("Returning TON CCIPProvider", "chainSelector", chainSelector, "pluginType", cargs.PluginType,
		"cargs.offRampAddress", cargs.OffRampAddress, "offRampAddrStr", offRampAddrStr)

	return &Provider{
		lggr:  logger.Named(lggr, CCIPProviderName),
		ct:    ct,
		ca:    ca,
		codec: c,
	}, nil
}

func (cp *Provider) Name() string {
	return cp.lggr.Name()
}

func (cp *Provider) Ready() error {
	return cp.StateMachine.Ready()
}

func (cp *Provider) Start(ctx context.Context) error {
	return cp.StartOnce(CCIPProviderName, func() error {
		cp.lggr.Debugw("Starting CCIPProvider")
		return nil
	})
}

func (cp *Provider) Close() error {
	return cp.StopOnce(CCIPProviderName, func() error {
		cp.wg.Wait()
		return nil
	})
}

func (cp *Provider) HealthReport() map[string]error {
	return map[string]error{cp.Name(): cp.Healthy()}
}

func (cp *Provider) ChainAccessor() ccipocr3.ChainAccessor {
	return cp.ca
}

func (cp *Provider) ContractTransmitter() ocr3types.ContractTransmitter[[]byte] {
	return cp.ct
}

func (cp *Provider) Codec() ccipocr3.Codec {
	return cp.codec
}
