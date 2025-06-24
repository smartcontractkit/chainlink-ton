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
	eng        *services.Engine
	lggr       logger.SugaredLogger
	client     ton.APIClientWrapped
	fltrs      *Filters
	store      *InMemoryStore
	pollPeriod time.Duration
	pageSize   uint32
}

func NewLogPoller(
	lggr logger.Logger,
	client ton.APIClientWrapped,
	pollPeriod time.Duration,
	pageSize uint32,
) *Service {
	st := NewInMemoryStore()
	fl := newFilters()
	p := &Service{
		lggr:       logger.Sugared(lggr),
		client:     client,
		fltrs:      fl,
		store:      st,
		pollPeriod: pollPeriod,
		pageSize:   pageSize,
	}
	p.Service, p.eng = services.Config{
		Name:  "Service",
		Start: p.start,
	}.NewServiceEngine(lggr)
	return p
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

func (lp *Service) run(ctx context.Context) error {
	lastSeq := lp.store.LoadLastSeq()
	master, err := lp.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return err
	}
	if master.SeqNo <= lastSeq {
		return nil
	}

	addrs := lp.fltrs.GetDistinctAddresses()
	for _, addr := range addrs {
		if err := lp.loadForAddress(ctx, lastSeq, master, &addr); err != nil {
			lp.lggr.Errorw("loadForAddress failed", "addr", addr.String(), "err", err)
		}
	}

	lp.store.SaveLastSeq(master.SeqNo)
	return nil
}

// TODO: scale with background workers
func (lp *Service) loadForAddress(
	ctx context.Context,
	lastSeq uint32,
	master *ton.BlockIDExt,
	contractAddr *address.Address,
) error {
    // — end cursor: current state —
    accEnd, err := lp.client.GetAccount(ctx, master, contractAddr)
    if err != nil {
        return err
    }
    endLT, endHash := accEnd.LastTxLT, accEnd.LastTxHash

    // — start cursor: re-fetch the old block at lastSeq —
		// TODO: add tests
		// TODO: alternatively we can store the last cursor by contract(in filter) in the store
    var startLT uint64
    var startHash []byte
    if lastSeq > 0 {
        // 1) get the BlockIDExt for that seqno
        oldBlk, err := lp.client.LookupBlock(ctx, master.Workchain, master.Shard, lastSeq)
        if err != nil {
            return fmt.Errorf("couldn't fetch master block %d: %w", lastSeq, err)
        }
        // 2) re-load the account at that historic block
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
			// for each msg in tx.IO.Out:
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
				fIDs := lp.fltrs.MatchingFilters(*ext.SrcAddr, topic)
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

func (lp *Service) RegisterFilter(ctx context.Context, flt types.Filter) {
	lp.fltrs.RegisterFilter(ctx, flt)
}

func (lp *Service) UnregisterFilter(ctx context.Context, name string) {
	lp.fltrs.UnregisterFilter(ctx, name)
}

func (lp *Service) Store() *InMemoryStore {
	return lp.store
}
