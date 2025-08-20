package smoke

import (
	"testing"

	"github.com/stretchr/testify/require"

	test_utils "integration-tests/utils"

	chainsel "github.com/smartcontractkit/chain-selectors"
)

func Test_TonAccessorEventQueries(t *testing.T) {
	client := test_utils.CreateAPIClient(t, chainsel.TON_LOCALNET.Selector).WithRetry()
	require.NotNil(t, client)

	t.Run("initialize logpoller and tonaccessor", func(t *testing.T) {
		t.Skip("implement me")
	})

	t.Run("deploy and configure TON contracts using changeset", func(t *testing.T) {
		t.Skip("implement me")
	})

	t.Run("register onramp contract filter to logpoller", func(t *testing.T) {
		t.Skip("implement me")
	})

	t.Run("single CCIP send message happy path", func(t *testing.T) {
		t.Skip("implement me")
		t.Run("send CCIP message", func(t *testing.T) {
			t.Skip("implement me")
		})

		t.Run("query CCIP message via TonAccessor", func(t *testing.T) {
			t.Skip("implement me")
		})
	})

	t.Run("multiple CCIP send message happy path", func(t *testing.T) {
		t.Skip("implement me")
		t.Run("send multiple CCIP messages", func(t *testing.T) {
			t.Skip("implement me")
		})

		t.Run("MsgsBetweenSeqNums", func(t *testing.T) {
			t.Skip("implement me")
		})

		t.Run("LatestMessageTo", func(t *testing.T) {
			t.Skip("implement me")
		})
	})
}
