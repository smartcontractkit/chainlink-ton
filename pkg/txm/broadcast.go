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

	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

var (
	errBroadcastAborted = errors.New("broadcast aborted")
	errTxExpired        = errors.New("transaction expired, not broadcasting")
	errTxRejected       = errors.New("transaction rejected by TON node, likely due to insufficient balance")
	errOutcomeUnknown   = errors.New("broadcast outcome unknown: the last sent message may have been processed")
)

// signedMessage is a signed HighloadV3 external message carrying a transaction, with the times
// bounding when the wallet can accept it, taken from its signed payload.
type signedMessage struct {
	ext *tlb.ExternalMessage
	// createdAt is ext's created_at: no block made before it can process ext.
	createdAt time.Time
	// expiresAt is ext's created_at plus its timeout: no block made at or after it can process ext.
	expiresAt time.Time
	// sendBefore is when, allowing for the chain's clock differing from the local one, the wallet
	// may start treating ext as expired. ext is not sent after it, since a rejection could then be
	// an expiry rather than a final rejection.
	sendBefore time.Time
}

// broadcast holds the inputs of a transaction's broadcast, shared by all its attempts. Its
// fields are not modified once set.
type broadcast struct {
	t      *Txm
	client tracetracking.SignedAPIClient
	tx     *Tx
	msg    *wallet.Message
	txID   string
}

// run broadcasts the transaction, retrying failed attempts, and returns the wallet transaction
// that processed it.
//
// Every attempt sends the same signed external message. An attempt can fail after its message
// was already accepted; re-sending the same message cannot execute it twice, since the wallet
// rejects a message it already processed, whereas a newly built one (new query id) would deliver
// the internal message again. A new message is built only once the previous one can no longer
// be accepted and was not processed.
//
// A broadcast that gives up (the transaction expired or the attempts ran out) after sending a
// message first settles that message, since it may have been processed or may still be: see
// settle.
func (b *broadcast) run(ctx context.Context) (*tracetracking.ReceivedMessage, error) {
	retryDelay := backoff.Backoff{
		Min:    b.t.config.SendRetryDelay.Duration(),
		Max:    b.t.config.MaxSendRetryDelay.Duration(),
		Factor: 2,
		Jitter: true,
	}

	var sent *signedMessage // the message sent by earlier attempts, nil before the first send
	var lastErr error
	for attempt := uint(1); attempt <= b.t.config.MaxSendRetryAttempts; attempt++ {
		if attempt > 1 && !b.t.waitFor(retryDelay.Duration()) {
			return nil, errBroadcastAborted
		}
		// Once sent must not be sent again, wait until the chain is likely past its expiry, when a
		// lookup can tell for certain whether it was processed.
		if sent != nil && time.Now().After(sent.sendBefore) && !b.t.waitFor(time.Until(sent.expiresAt.Add(b.t.messageClockSkew))) {
			return nil, errBroadcastAborted
		}
		if expiredErr := b.checkExpired(); expiredErr != nil {
			found, err := b.settle(ctx, sent)
			if found != nil || err != nil {
				return found, err
			}
			return nil, expiredErr
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
		resent := next == sent
		sent = next

		received, err := b.send(ctx, attempt, sent)
		if err != nil && tracetracking.IsInboundExternalMessageRejectedByAccountError(err) {
			received, err = b.checkRejection(ctx, attempt, sent, resent, err)
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

	found, err := b.settle(ctx, sent)
	if found != nil || err != nil {
		return found, err
	}
	return nil, b.failed(ctx, fmt.Errorf("failed after %d attempts: %w", b.t.config.MaxSendRetryAttempts, lastErr))
}

// settle finds out what happened to sent, the last message sent, once the broadcast will not send
// again: it waits until sent can no longer be accepted, then looks it up. It returns the wallet
// transaction that processed sent if there is one, and nil if sent is nil or was not processed.
// If a lookup cannot tell, it returns errOutcomeUnknown.
func (b *broadcast) settle(ctx context.Context, sent *signedMessage) (*tracetracking.ReceivedMessage, error) {
	if sent == nil {
		return nil, nil
	}
	if !b.t.waitFor(time.Until(sent.expiresAt.Add(b.t.messageClockSkew))) {
		return nil, errBroadcastAborted
	}

	found, coveredUntil, err := b.lookUp(ctx, sent)
	if err != nil {
		return nil, b.outcomeUnknown(ctx, fmt.Errorf("failed to look up the last sent message: %w", err))
	}
	if found != nil {
		b.t.logger.Infow("last sent message was processed after the broadcast's last attempt", "txID", b.txID)
		return found, nil
	}
	if coveredUntil.Before(sent.expiresAt) {
		return nil, b.outcomeUnknown(ctx, fmt.Errorf("the node's view reaches %s, the last sent message is acceptable until %s",
			coveredUntil.UTC().Format(time.RFC3339), sent.expiresAt.UTC().Format(time.RFC3339)))
	}
	return nil, nil
}

// outcomeUnknown records that it is unknown whether the transaction was executed, and returns
// errOutcomeUnknown with err, the reason. The broadcast is counted as failed, though the
// transaction may have been executed; the caller logs errOutcomeUnknown apart from a definite
// failure.
func (b *broadcast) outcomeUnknown(ctx context.Context, err error) error {
	b.t.metrics.IncrementFailedToBroadcastTxs(ctx)
	return fmt.Errorf("%w: %w", errOutcomeUnknown, err)
}

func (b *broadcast) checkExpired() error {
	if time.Now().Before(b.tx.Expiration) {
		return nil
	}
	return fmt.Errorf("%w: expired at %s", errTxExpired, b.tx.Expiration.UTC().Format(time.RFC3339))
}

// nextMessage returns the message the next send must use, given the message sent by earlier
// attempts (nil if none): sent itself while it can still be sent, or a newly built one once a
// lookup shows sent was not processed in any block that could accept it. If sent was already
// processed, it instead returns the wallet transaction that processed it and no message.
// Otherwise, when sent can be neither re-sent nor replaced, it returns an error.
func (b *broadcast) nextMessage(ctx context.Context, sent *signedMessage) (*tracetracking.ReceivedMessage, *signedMessage, error) {
	if sent == nil {
		next, err := b.build(ctx)
		return nil, next, err
	}

	found, coveredUntil, err := b.lookUp(ctx, sent)
	if err == nil && found != nil {
		b.t.logger.Infow("previously sent message was processed after its attempt ended", "txID", b.txID)
		return found, nil, nil
	}
	if err == nil && !coveredUntil.Before(sent.expiresAt) {
		b.t.logger.Infow("previously sent message expired unprocessed, building a new one", "txID", b.txID)
		next, buildErr := b.build(ctx)
		return nil, next, buildErr
	}

	// sent may still be processed, so it must not be replaced
	if time.Now().Before(sent.sendBefore) {
		if err != nil {
			b.t.logger.Warnw("failed to look up previously sent message, re-sending it", "txID", b.txID, "err", err)
		}
		return nil, sent, nil
	}
	if err != nil {
		return nil, nil, fmt.Errorf("failed to look up expired message: %w", err)
	}
	return nil, nil, fmt.Errorf("cannot tell yet whether the expired message was processed: the node's view reaches %s, the message is acceptable until %s",
		coveredUntil.UTC().Format(time.RFC3339), sent.expiresAt.UTC().Format(time.RFC3339))
}

// lookUp looks for the wallet transaction that processed sent, for at most SendTimeout; see
// tracetracking.SignedAPIClient.FindExternalTransaction.
func (b *broadcast) lookUp(ctx context.Context, sent *signedMessage) (*tracetracking.ReceivedMessage, time.Time, error) {
	lookupCtx, cancel := context.WithTimeout(ctx, b.t.config.SendTimeout.Duration())
	defer cancel()
	return b.client.FindExternalTransaction(lookupCtx, sent.ext, sent.createdAt)
}

// build signs a new external message carrying the transaction, for at most SendTimeout.
// Signing can be slow, so a message whose send window closed while it was being built is
// dropped; it was never sent.
func (b *broadcast) build(ctx context.Context) (*signedMessage, error) {
	buildCtx, cancel := context.WithTimeout(ctx, b.t.config.SendTimeout.Duration())
	defer cancel()
	ext, err := b.client.BuildExternalMessage(buildCtx, b.msg)
	if err != nil {
		return nil, err
	}
	createdAt, expiresAt, err := tonconfig.HighloadV3MessageWindow(ext)
	if err != nil {
		return nil, fmt.Errorf("failed to read the signed message's validity: %w", err)
	}

	sendBefore := expiresAt.Add(-b.t.messageClockSkew)
	if !time.Now().Before(sendBefore) {
		return nil, fmt.Errorf("message was built too late to be sent: its send window closed at %s",
			sendBefore.UTC().Format(time.RFC3339))
	}
	return &signedMessage{
		ext:        ext,
		createdAt:  createdAt,
		expiresAt:  expiresAt,
		sendBefore: sendBefore,
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

// checkRejection handles the wallet rejecting sent. On sent's first send the rejection is final
// (errTxRejected): nothing could have processed sent before. The wallet also rejects a re-sent
// message it already processed, so for a re-send it returns the wallet transaction of an earlier
// send of sent if a lookup finds one, and a retryable error otherwise: the node looked up may not
// have that transaction yet, so only a later lookup, once sent expired, can tell.
func (b *broadcast) checkRejection(ctx context.Context, attempt uint, sent *signedMessage, resent bool, rejectErr error) (*tracetracking.ReceivedMessage, error) {
	if !resent {
		return nil, fmt.Errorf("%w: %w", errTxRejected, rejectErr)
	}
	found, _, err := b.lookUp(ctx, sent)
	if err != nil {
		return nil, fmt.Errorf("re-sent message rejected (%w), and failed to look up whether it was already processed: %w", rejectErr, err)
	}
	if found == nil {
		return nil, fmt.Errorf("re-sent message rejected (%w), and not found yet among the wallet's transactions", rejectErr)
	}
	b.t.logger.Infow("re-sent message was rejected because it was already processed",
		"txID", b.txID,
		"attempt", attempt)
	return found, nil
}

// failed records that the transaction could not be broadcast and returns err. It does not log
// err: the caller does.
func (b *broadcast) failed(ctx context.Context, err error) error {
	b.t.metrics.IncrementFailedToBroadcastTxs(ctx)
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
