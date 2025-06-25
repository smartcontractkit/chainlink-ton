package logpoller

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

type LogPoller interface {
	services.Service
	Healthy() error
	Start(context.Context) error
	Ready() error
	Close() error
	RegisterFilter(ctx context.Context, flt types.Filter) error
	UnregisterFilter(ctx context.Context, name string) error
	// TODO(NONEVM-1460): add remaining functions
}

type Service struct {
	services.Service
	eng                *services.Engine
	lggr               logger.SugaredLogger
	client             ton.APIClientWrapped
	filters            *Filters
	store              *InMemoryStore
	pollPeriod         time.Duration
	pageSize           uint32
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
	filters := newFilters()
	lp := &Service{
		lggr:       logger.Sugared(lggr),
		client:     client,
		filters:    filters,
		store:      store,
		pollPeriod: pollPeriod,
		pageSize:   pageSize,
	}
	lp.Service, lp.eng = services.Config{
		Name:  "Service",
		Start: lp.start,
	}.NewServiceEngine(lggr)
	return lp
}

func (lp *Service) start(ctx context.Context) error {
	lp.lggr.Infof("starting logpoller")
	lp.eng.GoTick(services.NewTicker(lp.pollPeriod), func(ctx context.Context) {
		if err := lp.run(ctx); err != nil {
			lp.lggr.Errorw("iteration failed", "err", err)
		}
	})
	return nil
}

func (lp *Service) run(ctx context.Context) (err error) {
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("panic recovered: %v", rec)
		}
	}()

	lastProcessedSeq, err := lp.getLastProcessedSeqNo()
	if err != nil {
		return fmt.Errorf("LoadLastSeq: %w", err)
	}
	// TODO: load filter from persistent store
	// TODO: implement backfill logic(if there is filters marked for backfill)

	// get the current masterchain seqno
	master, err := lp.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return err
	}
	// compare with last processed seqno, if last seqno is higher, there is a problem
	if master.SeqNo < lastProcessedSeq {
		return fmt.Errorf("last seqno (%d) > chain seqno (%d)", lastProcessedSeq, master.SeqNo)
	}
	// if we already processed this seqno, skip
	if master.SeqNo == lastProcessedSeq {
		lp.lggr.Debugw("skipping already processed masterchain seq", "seq", master.SeqNo)
	}
	lp.lggr.Debugw("Got new seq range to process", "from", lastProcessedSeq+1, "to", master.SeqNo)

	// load the addresses from filters that we're interested in
	addrs := lp.filters.GetDistinctAddresses()
	for _, addr := range addrs {
		if err := lp.loadForAddress(ctx, lastProcessedSeq, master, &addr); err != nil {
			lp.lggr.Errorw("loadForAddress failed", "addr", addr.String(), "err", err)
		}
	}

	// save the last processed seqno
	lp.lastProcessedSeqNo = master.SeqNo
	return nil
}

// TODO: scale with background workers
func (lp *Service) loadForAddress(
	ctx context.Context,
	lastSeq uint32,
	master *ton.BlockIDExt,
	contractAddr *address.Address,
) error {
	accEnd, err := lp.client.GetAccount(ctx, master, contractAddr)
	if err != nil {
		return err
	}
	endLT, endHash := accEnd.LastTxLT, accEnd.LastTxHash

	var startLT uint64
	var startHash []byte
	if lastSeq > 0 {
		oldBlk, err := lp.client.LookupBlock(ctx, master.Workchain, master.Shard, lastSeq)
		if err != nil {
			return fmt.Errorf("couldn't fetch master block %d: %w", lastSeq, err)
		}
		accStart, err := lp.client.GetAccount(ctx, oldBlk, contractAddr)
		if err != nil {
			return fmt.Errorf("couldn't get account at old block %d: %w", lastSeq, err)
		}
		startLT = accStart.LastTxLT
		startHash = accStart.LastTxHash
	}

	curLT, curHash := endLT, endHash
	for {
		batch, err := lp.client.ListTransactions(ctx, contractAddr, lp.pageSize, curLT, curHash)
		if errors.Is(err, ton.ErrNoTransactionsWereFound) {
			break
		} else if err != nil {
			return fmt.Errorf("ListTransactions: %w", err)
		}
		if len(batch) == 0 {
			break
		}
		for _, tx := range batch {
			if tx.LT < startLT || (tx.LT == startLT && bytes.Equal(tx.Hash, startHash)) {
				goto DONE
			}

			msgs, _ := tx.IO.Out.ToSlice()
			for _, msg := range msgs {
				if msg.MsgType != tlb.MsgTypeExternalOut {
					continue
				}
				ext := msg.AsExternalOut()
				if ext.Body == nil {
					continue
				}
				topic := ExtractEventTopicFromAddress(ext.DstAddr)
				fIDs := lp.filters.MatchingFilters(*ext.SrcAddr, topic)
				if len(fIDs) == 0 {
					continue
				}

				for _, fid := range fIDs {
					lp.store.SaveLog(types.Log{
						FilterID:   fid,
						SeqNo:      master.SeqNo,
						Address:    *ext.SrcAddr,
						EventTopic: topic,
						Data:       ext.Body.ToBOC(),
					})
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

func (lp *Service) getLastProcessedSeqNo() (uint32, error) {
	lastProcessed := lp.lastProcessedSeqNo
	if lastProcessed > 0 {
		return lastProcessed, nil
	}

	// TODO: get the latest processed seqno from log table

	// TODO: implement lookbackwindow configuration and fallback logic if needed
	return lastProcessed, nil
}

func (lp *Service) RegisterFilter(ctx context.Context, flt types.Filter) {
	lp.filters.RegisterFilter(ctx, flt)
}

func (lp *Service) UnregisterFilter(ctx context.Context, name string) {
	lp.filters.UnregisterFilter(ctx, name)
}

func (lp *Service) Store() *InMemoryStore {
	return lp.store
}
