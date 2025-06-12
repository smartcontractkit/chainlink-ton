package logpoller

import (
	"context"
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/xssnick/tonutils-go/ton"
)

type LogPoller interface {
	services.Service
	Healthy() error
	Start(context.Context) error
	Ready() error
	Close() error
	// TODO(NONEVM-1460): add remaining functions
}
type Service struct {
	services.StateMachine
	pollPeriod time.Duration // poll period set by block production rate
	lggr       logger.SugaredLogger
	// TODO: this is lite-client client, but we might need to change it to a full node client, test in progress
	// TODO: we might need LiteClient or FullNodeClient impl in package, abstracting ton.APIClient methods
	// TODO: find a way to mock this in unit tests
	client ton.APIClientWrapped

	stopCh services.StopChan
	wg     sync.WaitGroup
}

// TODO: make it configurable
func NewLogPoller(lggr logger.Logger, cl ton.APIClientWrapped) *Service {
	return &Service{
		stopCh:     make(chan struct{}),
		client:     cl,
		lggr:       logger.Sugared(logger.Named(lggr, "LogPoller")),
		pollPeriod: 6 * time.Second,
	}
}

func (lp *Service) Start(context.Context) error {
	return lp.StartOnce("LogPoller", func() error {
		lp.wg.Add(1)
		go lp.run()
		return nil
	})
}

func (lp *Service) run() {
	defer lp.wg.Done()

}
