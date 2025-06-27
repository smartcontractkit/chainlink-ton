package mocks

import (
	"context"
	"time"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	logpollertypes "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

// TODO: gobindings for the commit report accepted event
// TODO: possibly with `Meta` we need a separate type
// TODO: Topic should be available with Event gobindings, so we can use it to filter logs

type CommitReportAcceptedEvent struct { // TODO: need a actual binding with TLB tags
	PriceUpdates         any `tlb:"^"` // TODO: define PriceUpdates type
	BlessedMerkleRoots   any `tlb:"^"`
	UnblessedMerkleRoots any `tlb:"^"`
}

func (e *CommitReportAcceptedEvent) Topic() uint64 {
	return 0x123
}

type CommitPluginReportWithMeta struct {
	Report any
	Meta   any
}

type TONAccessor struct {
	lggr logger.Logger
	lp   logpoller.LogPoller
}

func (ac *TONAccessor) CommitReportsGTETimestamp(
	ctx context.Context,
	ts time.Time,
	confidence primitives.ConfidenceLevel,
	limit int,
) ([]CommitPluginReportWithMeta, error) {
	lggr := ac.lggr
	// TODO: so here we won't have CR, CAL will read logs directly from the log poller
	// TODO: and parse them from raw BOC(log.Data) to CommitReportAcceptedEvent gobindings
	// TODO: using tlb.LoadCellFromBOC, OR, with custom decoder for the CommitReportAcceptedEvent type(snake cells decoder)

	// TODO: CR has config for finding the right contract address from the name,
	// TODO: Do we need a config for CAL as well? or, do we keep name-address map in lp? -> nonsense, there could be multiple contracts(?)

	evtSrcAddress := "consts.ContractNameOffRamp"
	event := &CommitReportAcceptedEvent{}

	// TODO: here logs are directly []logpoller.log type
	// TODO: add timestamp, and see if we can try to share a function, but likely we'll need three separate queries
	logs, err := ac.lp.FilteredCCIPLogs(ctx, evtSrcAddress, event.Topic(), limit)
	if err != nil {
		lggr.Errorw("failed to query filtered CCIP logs", "error", err)
		return nil, err
	}

	lggr.Debugw("queried commit reports", "numReports", len(logs),
		"ts", ts,
		"limit", limit)

	// TODO: validate and construct reports

	reports := ac.processCommitReports(lggr, logs, ts, limit)

	return reports, nil
}

func (ac *TONAccessor) processCommitReports(
	lggr logger.Logger,
	logs []logpollertypes.Log,
	ts time.Time, // TODO: purpose?
	limit int,
) []CommitPluginReportWithMeta {
	reports := make([]CommitPluginReportWithMeta, 0, limit)
	for _, log := range logs {
		cell, err := cell.FromBOC(log.Data) // BOC
		if err != nil {
			lggr.Errorw("failed to parse log data BOC", "error", err,
				"logID", log.ID, "seqNo", log.SeqNo, "address", log.Address.String())
			continue
		}
		// TODO: basic validation and parsing of the event
		// TODO: use tlb.LoadFromCell to parse the event OR custom decoder
		event := tlb.LoadFromCell(&CommitReportAcceptedEvent{}, cell.BeginParse())
		if err != nil {
			lggr.Errorw("failed to parse commit report", "error", err)
			continue
		}

		report := CommitPluginReportWithMeta{
			Report: event,
			Meta:   nil, // TODO: fill in meta if needed
		}

		reports = append(reports, report)
		if len(reports) >= limit {
			break
		}
	}
	return reports
}
