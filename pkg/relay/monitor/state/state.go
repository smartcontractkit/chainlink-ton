package state

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
)

type ServiceOptions struct {
	ContractsToMonitor []address.Address

	LogPoller logpoller.Service
	Logger    logger.Logger
	KeyStore  core.Keystore
}

func NewService(opts ServiceOptions) (services.Service, error) {
	return service{
		Service: nil,
		eng:     &services.Engine{},
		lggr:    logger.Sugared(opts.Logger),
		clientProvider: func(context.Context) (ton.APIClientWrapped, error) {
			panic("TODO")
		},
		chainID: "",
		s:       nil,
	}, nil
}

type service struct {
	services.Service
	eng            *services.Engine                                    // Service engine for lifecycle management
	lggr           logger.SugaredLogger                                // Logger instance
	clientProvider func(context.Context) (ton.APIClientWrapped, error) // TON blockchain client lazy getter
	chainID        string                                              // Target chain ID

	s logpoller.Service // Log poller service
}

// Close implements services.Service.
func (s service) Close() error {
	panic("unimplemented")
}

// HealthReport implements services.Service.
func (s service) HealthReport() map[string]error {
	panic("unimplemented")
}

// Name implements services.Service.
func (s service) Name() string {
	return s.lggr.Name()

}

// Ready implements services.Service.
func (s service) Ready() error {
	panic("unimplemented")
}

// Start implements services.Service.
func (s service) Start(context.Context) error {
	s.Service, s.eng = services.Config{
		Name:  "TONLogPoller",
		Start: s.start,
	}.NewServiceEngine(lggr)
}
