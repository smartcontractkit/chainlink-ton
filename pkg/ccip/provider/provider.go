package provider

import (
	"context"
	"fmt"
	"sync"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/libocr/offchainreporting2plus/ocr3types"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

var _ commontypes.CCIPProvider = &Provider{}

const CCIPProviderName = "TONCCIPProvider"

type Provider struct {
	lggr  logger.Logger
	ca    ccipocr3.ChainAccessor
	ct    ocr3types.ContractTransmitter[[]byte]
	codec ccipocr3.Codec

	wg sync.WaitGroup
	services.StateMachine
}

func NewCCIPProvider(lggr logger.Logger, chainSelector ccipocr3.ChainSelector, client ton.APIClientWrapped, txm txm.TxManager, logPoller logpoller.LogPoller) (*Provider, error) {
	ct, err := ocr.NewCCIPTransmitter(txm, lggr)
	if err != nil {
		return nil, fmt.Errorf("failed to create a CCIP ContractTransmitter: %w", err)
	}

	codec := ccipocr3.Codec{
		ChainSpecificAddressCodec: &codec.AddressCodec{},
		CommitPluginCodec:         &codec.CommitPluginCodecV1{},
		ExecutePluginCodec:        &codec.ExecutePluginCodecV1{},
		TokenDataEncoder:          nil, // TODO(NONEVM-1460): implement
		SourceChainExtraDataCodec: &codec.ExtraDataDecoder{},
	}

	ca, err := chainaccessor.NewTONAccessor(lggr, chainSelector, client, logPoller, codec.ChainSpecificAddressCodec)
	if err != nil {
		return nil, fmt.Errorf("failed to create TON Accessor: %w", err)
	}

	return &Provider{
		lggr:  logger.Named(lggr, CCIPProviderName),
		ct:    ct,
		ca:    ca,
		codec: codec,
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
