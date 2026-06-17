package logpoller

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

func TestParseTxValidation(t *testing.T) {
	t.Parallel()
	// minimal service for testing - only need to test nil checks
	lp := &service{}
	filterIndex := models.FilterIndex{}

	t.Run("rejects nil transaction", func(t *testing.T) {
		t.Parallel()
		_, err := lp.parseTx(t.Context(), models.Tx{Transaction: nil}, "chainID", filterIndex)
		require.Error(t, err)
	})

	t.Run("rejects nil block", func(t *testing.T) {
		t.Parallel()
		tx := models.Tx{Transaction: &tlb.Transaction{}}
		_, err := lp.parseTx(t.Context(), tx, "chainID", filterIndex)
		require.Error(t, err)
	})
}
