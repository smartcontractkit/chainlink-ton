package ccip_provider

import (
	"context"
	"sync"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/libocr/offchainreporting2plus/ocr3types"
)

var _ commontypes.CCIPProvider = &CCIPProvider{}

const CCIPProviderName = "TONCCIPProvider"

type CCIPProvider struct {
	lggr logger.Logger
	ca   ccipocr3.ChainAccessor
	ct   ocr3types.ContractTransmitter[[]byte]

	wg sync.WaitGroup
	services.StateMachine
}

func NewCCIPProvider(lggr logger.Logger, ca ccipocr3.ChainAccessor, ct ocr3types.ContractTransmitter[[]byte]) (*CCIPProvider, error) {
	cp := &CCIPProvider{
		lggr: logger.Named(lggr, CCIPProviderName),
		ca:   ca,
		ct:   ct,
	}

	return cp, nil
}

func (cp *CCIPProvider) Name() string {
	return cp.lggr.Name()
}

func (cp *CCIPProvider) Ready() error {
	return cp.StateMachine.Ready()
}

func (cp *CCIPProvider) Start(ctx context.Context) error {
	return cp.StartOnce(CCIPProviderName, func() error {
		cp.lggr.Debugw("Starting CCIPProvider")
		return nil
	})
}

func (cp *CCIPProvider) Close() error {
	return cp.StopOnce(CCIPProviderName, func() error {
		cp.wg.Wait()
		return nil
	})
}

func (cp *CCIPProvider) HealthReport() map[string]error {
	return map[string]error{cp.Name(): cp.Healthy()}
}

func (cp *CCIPProvider) ChainAccessor() ccipocr3.ChainAccessor {
	return nil
}

func (cp *CCIPProvider) ContractTransmitter() ocr3types.ContractTransmitter[[]byte] {
	return nil
}
