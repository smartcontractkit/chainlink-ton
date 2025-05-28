package txm

import (
	"context"
	"sync"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/fees"
)

type TxManager interface {
	services.Service
	// TODO(NONEVM-1460): add remaining interface functions
}

var _ TxManager = (*Txm)(nil)

type Txm struct {
	services.StateMachine
	lggr   logger.Logger
	chStop services.StopChan
	done   sync.WaitGroup
	fee    fees.Estimator
	// TODO(NONEVM-1460): add remaining members
}

func (txm *Txm) Start(ctx context.Context) error {
	return txm.StartOnce("Txm", func() error {
		txm.lggr.Debugw("Starting Txm service")
		// TODO(NONEVM-1460): implement actual start logic
		return nil
	})
}

func (txm *Txm) Close() error {
	return txm.StopOnce("Txm", func() error {
		txm.lggr.Debugw("Stopping Txm service")
		close(txm.chStop)
		txm.done.Wait()
		return txm.fee.Close()
	})
}

func (txm *Txm) HealthReport() map[string]error {
	return map[string]error{
		txm.Name(): txm.Healthy(),
	}
}

func (txm *Txm) Name() string {
	return txm.lggr.Name()
}

func (txm *Txm) FeeEstimator() fees.Estimator {
	return txm.fee
}
