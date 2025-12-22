package logpoller

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

func TestParseTxValidation(t *testing.T) {
	// minimal service for testing - only need to test nil checks
	lp := &service{}
	filterIndex := models.FilterIndex{}

	t.Run("rejects nil transaction", func(t *testing.T) {
		_, err := lp.parseTx(nil, &ton.BlockIDExt{}, "chainID", filterIndex)
		require.Error(t, err)
	})

	t.Run("rejects nil block", func(t *testing.T) {
		tx := &tlb.Transaction{}
		_, err := lp.parseTx(tx, nil, "chainID", filterIndex)
		require.Error(t, err)
	})
}
