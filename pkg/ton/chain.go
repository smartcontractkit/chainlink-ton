package ton

import (
	"context"
	"math/big"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"
	"github.com/smartcontractkit/chainlink-common/pkg/types"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
)

type Chain interface {
	types.ChainService

	ID() string
	// TODO(NONEVM-1460): add remaining Chain interface functions
}

type ChainOpts struct {
	Logger   logger.Logger
	KeyStore core.Keystore
	DS       sqlutil.DataSource
}

var _ Chain = (*chain)(nil)

type chain struct {
	services.StateMachine
	stopCh services.StopChan
	id     string

	lggr logger.Logger
	// TODO(NONEVM-1460): implement remaining members
}

func NewChain(cfg *config.TOMLConfig, opts ChainOpts) (Chain, error) {
	// TODO(NONEVM-1460): implement actual constructor, return dummy chain for now
	c := &chain{
		lggr:   logger.Named(opts.Logger, "DummyChain"),
		stopCh: make(services.StopChan),
		id:     "dummy",
	}
	return c, nil
}

func (c *chain) Name() string {
	return c.lggr.Name()
}

func (c *chain) Start(ctx context.Context) error {
	// TODO(NONEVM-1460): implement
	return nil
}

func (c *chain) Close() error {
	// TODO(NONEVM-1460): implement
	return nil
}

func (c *chain) Ready() error {
	// TODO(NONEVM-1460): implement
	return nil
}

func (c *chain) HealthReport() map[string]error {
	// TODO(NONEVM-1460): implement
	return nil
}

func (c *chain) LatestHead(ctx context.Context) (types.Head, error) {
	// TODO(NONEVM-1460): implement
	return types.Head{}, nil
}

func (c *chain) GetChainStatus(ctx context.Context) (types.ChainStatus, error) {
	// TODO(NONEVM-1460): implement
	return types.ChainStatus{}, nil
}

func (c *chain) ListNodeStatuses(ctx context.Context, pageSize int32, pageToken string) (stats []types.NodeStatus, nextPageToken string, total int, err error) {
	// TODO(NONEVM-1460): implement
	return nil, "", 0, nil
}

func (c *chain) Transact(ctx context.Context, from, to string, amount *big.Int, balanceCheck bool) error {
	// TODO(NONEVM-1460): implement
	return nil
}

func (c *chain) Replay(ctx context.Context, fromBlock string, args map[string]any) error {
	// TODO(NONEVM-1460): implement
	return nil
}

func (c *chain) ID() string {
	// TODO(NONEVM-1460): implement
	return c.id
}
