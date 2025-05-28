package chainreader

import (
	"context"
	"sync"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-common/pkg/types"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
)

type EventsReader interface {
	Start(ctx context.Context) error
	Ready() error
	// TODO(NONEVM-1460): add remaining functions
}

const ServiceName = "TONContractReader"

type ContractReaderService struct {
	types.UnimplementedContractReader

	// provided dependencies
	lggr   logger.Logger
	reader EventsReader

	// service state management
	wg sync.WaitGroup
	services.StateMachine
}

var (
	_ services.Service     = &ContractReaderService{}
	_ types.ContractReader = &ContractReaderService{}
)

func NewContractReaderService(lggr logger.Logger, cfg config.ContractReader, reader EventsReader) (*ContractReaderService, error) {
	cr := &ContractReaderService{
		lggr:   logger.Named(lggr, ServiceName),
		reader: reader,
	}

	return cr, nil
}

// Name implements the services.ServiceCtx interface and returns the logger service name.
func (s *ContractReaderService) Name() string {
	return s.lggr.Name()
}

// Start implements the services.ServiceCtx interface and starts necessary background services.
// An error is returned if starting any internal services fails. Subsequent calls to Start return
// and error.
func (s *ContractReaderService) Start(ctx context.Context) error {
	return s.StartOnce(ServiceName, func() error {
		s.lggr.Debugw("Starting ContractReaderService", "config", s.reader)
		// TODO(NONEVM-1460): start up log poller
		return nil
	})
}

// Close implements the services.ServiceCtx interface and stops all background services and cleans
// up used resources. Subsequent calls to Close return an error.
func (s *ContractReaderService) Close() error {
	return s.StopOnce(ServiceName, func() error {
		s.wg.Wait()
		return nil
	})
}

// Ready implements the services.ServiceCtx interface and returns an error if starting the service
// encountered any errors or if the service is not ready to serve requests.
func (s *ContractReaderService) Ready() error {
	return s.StateMachine.Ready()
}

// HealthReport implements the services.ServiceCtx interface and returns errors for any internal
// function or service that may have failed.
func (s *ContractReaderService) HealthReport() map[string]error {
	return map[string]error{s.Name(): s.Healthy()}
}
