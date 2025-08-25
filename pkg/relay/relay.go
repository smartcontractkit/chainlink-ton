package relay

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strconv"

	"github.com/xssnick/tonutils-go/tlb"

	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"

	provider "github.com/smartcontractkit/chainlink-ton/pkg/ccip/provider"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

var _ TxManager = (*txm.Txm)(nil)

type TxManager interface {
	services.Service

	Enqueue(request txm.Request) error
	GetTransactionStatus(ctx context.Context, lt uint64) (commontypes.TransactionStatus, tvm.ExitCode, tlb.Coins, error)
	GetClient() tracetracking.SignedAPIClient
	InflightCount() (int, int)
}

var _ commontypes.Relayer = &Relayer{}

type Relayer struct {
	commontypes.UnimplementedRelayer
	services.StateMachine
	lggr       logger.Logger
	chain      Chain
	tonService Service
	stopCh     services.StopChan
}

func NewRelayer(lggr logger.Logger, chain Chain, tonService Service, _ core.CapabilitiesRegistry) *Relayer {
	return &Relayer{
		lggr:       logger.Named(lggr, "Relayer"),
		chain:      chain,
		tonService: tonService,
		stopCh:     make(services.StopChan),
	}
}

func (r *Relayer) Name() string {
	return r.lggr.Name()
}

// Start starts the relayer respecting the context provided.
func (r *Relayer) Start(ctx context.Context) error {
	return r.StartOnce("TONRelayer", func() error {
		// No subservices are started on TON relayer start, but rather when first job is started.
		if r.chain == nil {
			return errors.New("chain is not set for TON relayer")
		}
		return r.chain.Start(ctx)
	})
}

func (r *Relayer) Close() error {
	return r.StopOnce("TONRelayer", func() error {
		close(r.stopCh)
		return r.chain.Close()
	})
}

func (r *Relayer) Ready() error {
	return r.chain.Ready()
}

func (r *Relayer) HealthReport() map[string]error {
	hp := map[string]error{r.Name(): r.Healthy()}
	services.CopyHealth(hp, r.chain.HealthReport())
	return hp
}

func (r *Relayer) LatestHead(ctx context.Context) (commontypes.Head, error) {
	return r.chain.LatestHead(ctx)
}

func (r *Relayer) GetChainInfo(ctx context.Context) (commontypes.ChainInfo, error) {
	return r.chain.GetChainInfo(ctx)
}

func (r *Relayer) GetChainStatus(ctx context.Context) (commontypes.ChainStatus, error) {
	return r.chain.GetChainStatus(ctx)
}

func (r *Relayer) ListNodeStatuses(ctx context.Context, pageSize int32, pageToken string) (stats []commontypes.NodeStatus, nextPageToken string, total int, err error) {
	return r.chain.ListNodeStatuses(ctx, pageSize, pageToken)
}

func (r *Relayer) Transact(ctx context.Context, from, to string, amount *big.Int, balanceCheck bool) error {
	return r.chain.Transact(ctx, from, to, amount, balanceCheck)
}

func (r *Relayer) Replay(ctx context.Context, fromBlock string, args map[string]any) error {
	return r.chain.Replay(ctx, fromBlock, args)
}

func (r *Relayer) TON() (commontypes.TONService, error) {
	return &r.tonService, nil
}

func (r *Relayer) NewCCIPProvider(ctx context.Context, rargs commontypes.RelayArgs) (commontypes.CCIPProvider, error) {
	// TODO: store chainSelector within Chain
	chainID, err := strconv.ParseInt(r.chain.ID(), 10, 16)
	if err != nil {
		return nil, fmt.Errorf("invalid chain ID %s: could not parse as an integer: %w", r.chain.ID(), err)
	}
	chainSelector, ok := chain_selectors.TonChainIdToChainSelector()[int32(chainID)]
	if !ok {
		return nil, fmt.Errorf("invalid chain ID %d: could not find chain selector: %w", chainID, err)
	}

	// TODO: pass GetClient through? So we don't pin provider to a single client
	client, err := r.chain.GetClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch TON client: %w", err)
	}
	return provider.NewCCIPProvider(r.lggr, ccipocr3.ChainSelector(chainSelector), client, r.chain.TxManager(), r.chain.LogPoller())
}
