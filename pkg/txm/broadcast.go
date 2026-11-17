package txm

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jpillora/backoff"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

var (
	errBroadcastAborted = errors.New("broadcast aborted")
	errTxExpired        = errors.New("transaction expired, not broadcasting")
	errTxRejected       = errors.New("transaction rejected by TON node, likely due to insufficient balance")
)

// signedMessage is a signed external message carrying a transaction, with the local times
// bounding when the wallet can accept it.
type signedMessage struct {
	ext *tlb.ExternalMessage
	// sendBefore is when the wallet may start treating ext as expired. ext is not sent after it,
	// since a rejection could then be an expiry rather than a final rejection.
	sendBefore time.Time
	// validUntil is when the wallet can no longer accept ext.
	validUntil time.Time
}

// broadcast holds the inputs of a transaction's broadcast, shared by all its attempts. Its
// fields are not modified once set.
type broadcast struct {
	t      *Txm
	client tracetracking.SignedAPIClient
	tx     *Tx
	msg    *wallet.Message
	txID   string
	// lookupAfter is a time before any wallet transaction this broadcast can produce.
	lookupAfter time.Time
}

// run broadcasts the transaction, retrying failed attempts, and returns the wallet transaction
// that processed it.
//
// Every attempt sends the same signed external message. An attempt can fail after its message
// was already accepted; re-sending the same message cannot execute it twice, since the wallet
// rejects a message it already processed, whereas a newly built one (new query id) would deliver
// the internal message again. A new message is built only once the previous one can no longer
// be accepted and was not processed.
func (b *broadcast) run(ctx context.Context) (*tracetracking.ReceivedMessage, error) {
	retryDelay := backoff.Backoff{
		Min:    b.t.config.SendRetryDelay.Duration(),
		Max:    5 * time.Second,
		Factor: 2,
		Jitter: true,
	}

	var sent *signedMessage // the message sent by earlier attempts, nil before the first send
	var lastErr error
	for attempt := uint(1); attempt <= b.t.config.MaxSendRetryAttempts; attempt++ {
		if attempt > 1 && !b.t.waitFor(retryDelay.Duration()) {
			return nil, errBroadcastAborted
		}
		// Once sent must not be sent again, wait until it can no longer be accepted either, so
		// that a lookup can tell for certain whether it was processed.
		if sent != nil && time.Now().After(sent.sendBefore) && !b.t.waitFor(time.Until(sent.validUntil)) {
			return nil, errBroadcastAborted
		}
		if err := b.checkExpired(); err != nil {
			return nil, err
		}

		found, next, err := b.nextMessage(ctx, sent)
		if err != nil {
			lastErr = err
			b.logRetry(attempt, err)
			continue
		}
		if found != nil {
			return found, nil
		}
		sent = next

		received, err := b.send(ctx, attempt, sent)
		if err != nil && tracetracking.IsInboundExternalMessageRejectedByAccountError(err) {
			received, err = b.checkRejection(ctx, attempt, sent, err)
		}
		if err == nil {
			return received, nil
		}
		if errors.Is(err, errTxRejected) {
			return nil, b.failed(ctx, err)
		}
		lastErr = err
		b.logRetry(attempt, err)
	}
	return nil, b.failed(ctx, lastErr)
}

func (b *broadcast) checkExpired() error {
	if time.Now().Before(b.tx.Expiration) {
		return nil
	}
	b.t.logger.Warnw("transaction expired",
		"txID", b.txID,
		"to", b.tx.To.String(),
		"amount", b.tx.Amount.Nano().String(),
		"expiration", b.tx.Expiration.String())
	return errTxExpired
}

// nextMessage returns the message the next send must use, given the message sent by earlier
// attempts (nil if none): sent itself while the wallet can still accept it, otherwise a newly
// built one. If sent was already processed, it instead returns the wallet transaction that
// processed it and no message.
func (b *broadcast) nextMessage(ctx context.Context, sent *signedMessage) (*tracetracking.ReceivedMessage, *signedMessage, error) {
	if sent == nil {
		next, err := b.build(ctx)
		return nil, next, err
	}

	lookupStartedAt := time.Now()
	found, err := b.client.FindExternalTransaction(ctx, sent.ext, b.lookupAfter)
	expired := lookupStartedAt.After(sent.validUntil)
	if err != nil {
		if expired {
			// it is unknown whether the expired message was processed, so it can be neither
			// re-sent nor replaced until a lookup succeeds
			return nil, nil, fmt.Errorf("failed to look up expired message: %w", err)
		}
		// re-sending the same message is safe, so carry on without the lookup
		b.t.logger.Warnw("failed to look up previously sent message, re-sending it", "txID", b.txID, "err", err)
		return nil, sent, nil
	}
	if found != nil {
		b.t.logger.Infow("previously sent message was processed after its attempt ended", "txID", b.txID)
		return found, nil, nil
	}
	if !expired {
		return nil, sent, nil
	}

	b.t.logger.Infow("previously sent message expired unprocessed, building a new one", "txID", b.txID)
	next, err := b.build(ctx)
	return nil, next, err
}

// build signs a new external message carrying the transaction.
func (b *broadcast) build(ctx context.Context) (*signedMessage, error) {
	ext, err := b.client.BuildExternalMessage(ctx, b.msg)
	if err != nil {
		return nil, err
	}
	builtAt := time.Now()
	return &signedMessage{
		ext:        ext,
		sendBefore: builtAt.Add(b.t.messageValidity - b.t.messageClockSkew),
		validUntil: builtAt.Add(b.t.messageValidity + b.t.messageClockSkew),
	}, nil
}

// send sends the message and waits for the wallet transaction that processes it, for at most
// SendTimeout and never past the message's sendBefore.
func (b *broadcast) send(ctx context.Context, attempt uint, sent *signedMessage) (*tracetracking.ReceivedMessage, error) {
	b.t.logger.Debugw("sending transaction to TON",
		"txID", b.txID,
		"attempt", attempt,
		"to", b.tx.To.String(),
		"amount", b.tx.Amount.Nano().String(),
		"bounce", b.msg.InternalMessage.Bounce,
		"hasBody", b.msg.InternalMessage.Body != nil)

	timeout := min(b.t.config.SendTimeout.Duration(), time.Until(sent.sendBefore))
	sendCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return b.client.SendExternalWaitTransaction(sendCtx, b.tx.To, sent.ext)
}

// checkRejection handles the wallet rejecting sent. The wallet also rejects a re-sent message it
// already processed, so it returns the wallet transaction of an earlier send of sent if there is
// one. The rejection is final (errTxRejected) only once a lookup shows there is none; a failed
// lookup is returned as a retryable error.
func (b *broadcast) checkRejection(ctx context.Context, attempt uint, sent *signedMessage, rejectErr error) (*tracetracking.ReceivedMessage, error) {
	found, err := b.client.FindExternalTransaction(ctx, sent.ext, b.lookupAfter)
	if err != nil {
		return nil, fmt.Errorf("message rejected (%w), and failed to look up whether it was already processed: %w", rejectErr, err)
	}
	if found == nil {
		return nil, fmt.Errorf("%w: %w", errTxRejected, rejectErr)
	}
	b.t.logger.Infow("re-sent message was rejected because it was already processed",
		"txID", b.txID,
		"attempt", attempt)
	return found, nil
}

// failed records that the transaction could not be broadcast and returns err.
func (b *broadcast) failed(ctx context.Context, err error) error {
	b.t.metrics.IncrementFailedToBroadcastTxs(ctx)
	b.t.logger.Errorw("failed to broadcast tx after retries",
		"txID", b.txID,
		"err", err,
		"to", b.tx.To.String())
	return err
}

func (b *broadcast) logRetry(attempt uint, err error) {
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, ton.ErrTxWasNotConfirmed) {
		b.t.logger.Warnw("broadcast timed out, will retry",
			"txID", b.txID,
			"attempt", attempt,
			"to", b.tx.To.String(),
			"timeout", b.t.config.SendTimeout.Duration(),
			"err", err)
		return
	}
	b.t.logger.Warnw("failed to broadcast tx, will retry",
		"txID", b.txID,
		"attempt", attempt,
		"to", b.tx.To.String(),
		"err", err)
}

// waitFor waits for d. It returns false if the TXM is stopping.
func (t *Txm) waitFor(d time.Duration) bool {
	if d <= 0 {
		return true
	}
	select {
	case <-time.After(d):
		return true
	case <-t.stop:
		t.logger.Debugw("broadcastWithRetry: stopped while waiting to retry")
		return false
	}
}
