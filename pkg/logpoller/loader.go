package logpoller

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
)

// TODO: refactor as subengine, with scheduled background workers

type LogCollector struct {
	lggr logger.SugaredLogger
}

func NewLogCollector(
	client ton.APIClientWrapped,
	lggr logger.Logger,
) *LogCollector {
	return &LogCollector{
		lggr: logger.Sugared(lggr),
	}
}

func (lc *LogCollector) BackfillForAddresses(ctx context.Context, addresses []address.Address, fromSeqNo, toSeqNo uint32) error {
	//
	return nil

}
