package txm

import (
	"fmt"
	"math"
	"time"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Tx struct {
	Mode            uint8                         // send mode bitmask, controls how the TON message is processed
	From            address.Address               // wallet used to send the message
	To              address.Address               // destination address
	Amount          tlb.Coins                     // amount to send
	Body            *cell.Cell                    // optional body to attach
	StateInit       *cell.Cell                    // optional, for deploying new contracts
	Bounceable      bool                          // whether the destination is bounceable
	CreatedAt       time.Time                     // when the tx was first enqueued; its unix seconds fit in a uint32 (checked by newTx)
	BroadcastAt     time.Time                     // when the tx was successfully broadcasted
	FinalizedAt     time.Time                     // when the message status is finalized
	Expiration      time.Time                     // deadline for broadcasting the tx, TxExpiration after it was enqueued; its unix milliseconds are non-negative and fit in an int64 (checked by newTx)
	ReceivedMessage tracetracking.ReceivedMessage // received message
	ID              *string                       // optional: unique ID for transaction tracking
}

// newTx builds the Tx for request, created at createdAt and expiring ttl later. It errors if
// createdAt does not fit in uint32 unix seconds, the message's created_at, or the expiration is
// not representable in unix milliseconds, as kept by the tx store, so that the broadcast's
// conversions cannot fail after the tx was enqueued or sent.
func newTx(request Request, createdAt time.Time, ttl time.Duration) (*Tx, error) {
	expiration := createdAt.Add(ttl)
	if err := validateUnixSeconds32(createdAt); err != nil {
		return nil, fmt.Errorf("invalid transaction creation time: %w", err)
	}
	if err := validateUnixMillis(expiration); err != nil {
		return nil, fmt.Errorf("invalid transaction expiration: %w", err)
	}
	return &Tx{
		Mode:       request.Mode,
		From:       *request.FromWallet.Address(),
		To:         request.ContractAddress,
		Amount:     request.Amount,
		Body:       request.Body,
		StateInit:  request.StateInit,
		Bounceable: request.Bounce,
		CreatedAt:  createdAt,
		Expiration: expiration,
		ID:         request.ID,
	}, nil
}

// validateUnixSeconds32 errors unless t's unix seconds fit in a uint32, the type of a message's
// created_at: t must be between 1970 and 2106-02-07.
func validateUnixSeconds32(t time.Time) error {
	if sec := t.Unix(); sec < 0 || sec > math.MaxUint32 {
		return fmt.Errorf("timestamp %s is outside the uint32 unix seconds range", t.UTC().Format(time.RFC3339))
	}
	return nil
}

// validateUnixMillis errors unless t's unix milliseconds are non-negative and fit in an int64, so
// that t.UnixMilli() does not overflow and uint64(t.UnixMilli()) is exact. The seconds are checked
// because UnixMilli itself wraps silently for timestamps far from the epoch.
func validateUnixMillis(t time.Time) error {
	if sec := t.Unix(); sec < 0 || sec >= math.MaxInt64/1000 {
		return fmt.Errorf("timestamp %s is outside the unix milliseconds range", t.UTC().Format(time.RFC3339))
	}
	return nil
}
