package logpoller

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"reflect"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
)

type LogPoller interface {
	services.Service
	Healthy() error
	Start(context.Context) error
	Ready() error
	Close() error
	RegisterFilter(ctx context.Context, flt Filter, ev TopicEvent) error
	UnregisterFilter(ctx context.Context, name string) error
	Process(ctx context.Context, ev Event) error
	// TODO(NONEVM-1460): add remaining functions
}
type Service struct {
	services.Service
	eng        *services.Engine
	lggr       logger.SugaredLogger
	client     ton.APIClientWrapped
	filters    *filters
	store      *InMemoryStore
	pollPeriod time.Duration
	pageSize   uint32
	lastProcessedSeqNo uint32 // last processed masterchain seqno
}

func NewLogPoller(
	lggr logger.Logger,
	client ton.APIClientWrapped,
	// TODO: replace with global TON relayer config
	pollPeriod time.Duration,
	pageSize uint32,
) *Service {
	store := NewInMemoryStore()
	f := newFilters()
	lp := &Service{
		lggr:       logger.Sugared(logger.Named(lggr, "LogPoller")),
		client:     client,
		filters:    f,
		store:      store,
		pollPeriod: pollPeriod,
		pageSize:   pageSize,
	}
	lp.Service, lp.eng = services.Config{
		Name:  "LogPoller",
		Start: lp.start,
	}.NewServiceEngine(lggr)
	return lp
}

func (lp *Service) start(ctx context.Context) error {
	lp.lggr.Infof("starting logpoller (period=%s,pageSize=%d)", lp.pollPeriod, lp.pageSize)
	lp.eng.GoTick(services.NewTicker(lp.pollPeriod), func(ctx context.Context) {
		if err := lp.run(ctx); err != nil {
			lp.lggr.Errorw("iteration failed", "err", err)
		}
	})
	// TODO: register background workers if needed
	return nil
}

func (lp *Service) run(ctx context.Context) error {
	// TODO: handle recovery from panic
	lastProcessedSeq, err := lp.getLastProcessedSeqNo()
	if err != nil {
		return fmt.Errorf("LoadLastSeq: %w", err)
	}
	// TODO: load filter from persistent store
	// TODO: implement backfill logic(if there is filters marked for backfill)

	// load the addresses from filters that we're interested in
	addrs := lp.filters.GetDistinctAddresses(ctx)
	if len(addrs) == 0 {
		lp.lggr.Debug("no addresses to process, skipping")
		return nil
	}

	// get the current masterchain seqno
	master, err := lp.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return fmt.Errorf("CurrentMasterchainInfo: %w", err)
	}
	// compare with last processed seqno, if last seqno is higher, there is a problem
	if master.SeqNo < lastProcessedSeq {
		return fmt.Errorf("last seqno (%d) > chain seqno (%d)", lastProcessedSeq, master.SeqNo)
	}
	// if we already processed this seqno, skip
	if master.SeqNo == lastProcessedSeq {
		lp.lggr.Debugw("skipping already processed masterchain seq", "seq", master.SeqNo)
		return nil
	}

	lp.lggr.Debugw("Got new seq range to process", "from", lastProcessedSeq+1, "to", master.SeqNo)
	if err := lp.LoadRange(ctx, lastProcessedSeq, master, addrs); err != nil {
		lp.lggr.Errorw("loader LoadRange failed", "err", err)
	}

	if err := lp.store.SaveLastSeq(master.SeqNo); err != nil {
		return fmt.Errorf("SaveLastSeq: %w", err)
	}
	return nil
}

func (lp *Service) LoadRange(
	ctx context.Context,
	lastProcessedSeq uint32,
	master *ton.BlockIDExt,
	addrs []*address.Address,
) error {
	lp.lggr.Debugw("starting LoadRange", "masterSeq", master.SeqNo, "addresses", len(addrs), "pageSize", lp.pageSize)
	for _, addr := range addrs {
		if err := lp.loadForAddress(ctx, lastProcessedSeq, master, addr); err != nil {
			lp.lggr.Errorw("loadForAddress failed", "addr", addr.String(), "err", err)
			return fmt.Errorf("address %s: %w", addr.String(), err)
		}
	}
	return nil
}
func (lp *Service) loadForAddress(
	ctx context.Context,
	lastProcessedSeq uint32,
	master *ton.BlockIDExt,
	contract *address.Address,
) error {
	// TODO: validate behavior, get account status based on the master block
	accEnd, err := lp.client.GetAccount(ctx, master, contract)
	if err != nil {
		return fmt.Errorf("GetAccount(curr): %w", err)
	}
	endLT, endHash := accEnd.LastTxLT, accEnd.LastTxHash
	// FIXME: we need to get transactions between last processed seqno and current master seqno
	var startLT uint64
	var startHash []byte
	if lastProcessedSeq > 0 {
		startLT, startHash = endLT, endHash
	} else {
		startLT, startHash = 0, nil
	}

	lp.lggr.Debugw("loading transactions for address", "contract", contract.String(), "startLT", startLT, "endLT", endLT)

	curLT, curHash := endLT, endHash
	for {
		batch, err := lp.client.ListTransactions(ctx, contract, lp.pageSize, curLT, curHash)
		if err != nil {
			if errors.Is(err, ton.ErrNoTransactionsWereFound) {
				break
			}
			return err
		}
		if len(batch) == 0 {
			break
		}

		lp.lggr.Debugw("fetched batch", "contract", contract.String(), "count", len(batch))
		for _, tx := range batch {
			if tx.LT < startLT || (tx.LT == startLT && bytes.Equal(tx.Hash, startHash)) {
				goto DONE
			}
			for _, ev := range lp.filters.MatchingFiltersForTransaction(tx) {
				if err := lp.Process(ctx, ev); err != nil {
					lp.lggr.Errorw("process failed", "contract", contract.String(), "err", err)
				}
			}
		}

		last := batch[len(batch)-1]
		curLT, curHash = last.PrevTxLT, last.PrevTxHash
		if len(batch) < int(lp.pageSize) {
			break
		}
	}
DONE:
	return nil
}


func (lp *Service) Process(ctx context.Context, ev Event) error {
	lp.lggr.Infow("event received", "contract", ev.Source.String(), "data", ev.Data)
	// persist to in-memory store
	lp.store.SaveEvent(ev)
	return nil
}


func (lp *Service) getLastProcessedSeqNo() (uint32, error) {
	lastProcessed := lp.lastProcessedSeqNo
	if lastProcessed > 0 {
		return lastProcessed, nil
	}

	lastProcessed, err := lp.store.LoadLastSeq()
	if err != nil {
		return 0, fmt.Errorf("LoadLastSeq: %w", err)
	}
	// TODO: implement lookbackwindow configuration and fallback logic if needed
	return lastProcessed, nil
}

// TODO: implement Replay related methods

// RegisterFilter adds a runtime filter.
func (lp *Service) RegisterFilter(
	ctx context.Context,
	flt Filter,
	ev TopicEvent,
) error {
	return lp.filters.RegisterFilter(ctx, flt, reflect.TypeOf(ev))
}

// UnregisterFilter removes it.
func (lp *Service) UnregisterFilter(ctx context.Context, name string) error {
	return lp.filters.UnregisterFilter(ctx, name)
}

func (lp *Service) Store() *InMemoryStore {
	return lp.store
}
