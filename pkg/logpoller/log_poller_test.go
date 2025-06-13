package logpoller_test

import (
	"testing"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
)

func Test_LogPoller(t *testing.T) {

	var client ton.APIClientWrapped
	var lp *logpoller.Service

	t.Run("Start LogPoller", func(t *testing.T) {
		t.Skip("Skipping log poller test, register contracts / events first once PoC is done")
		lggr := logger.Test(t)
		lp = logpoller.NewLogPoller(lggr, client)
		lp.Start(t.Context())
	})
}
