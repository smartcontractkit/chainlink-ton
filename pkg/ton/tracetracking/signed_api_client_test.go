package tracetracking

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type lookupMockAPI struct {
	ton.APIClientWrapped
	err error
}

func (m lookupMockAPI) FindLastTransactionByInMsgHashAfterTime(context.Context, *address.Address, []byte, time.Time) (*tlb.Transaction, error) {
	return nil, m.err
}

func TestFindExternalTransaction(t *testing.T) {
	t.Parallel()

	ext := &tlb.ExternalMessage{
		DstAddr: address.MustParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF"),
		Body:    cell.BeginCell().EndCell(),
	}

	tests := []struct {
		name    string
		err     error
		wantErr bool
	}{
		{name: "all transactions checked", err: ton.ErrTxWasNotFound},
		{name: "older transactions unavailable", err: fmt.Errorf("archive node is needed: %w", ton.ErrTxWasNotFound), wantErr: true},
		{name: "lookup failed", err: errors.New("connection lost"), wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			c := NewSignedAPIClient(lookupMockAPI{err: tt.err}, wallet.Wallet{})
			found, err := c.FindExternalTransaction(t.Context(), ext, time.Now())
			require.Nil(t, found)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
