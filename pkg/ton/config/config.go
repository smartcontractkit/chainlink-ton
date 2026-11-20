package config

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"sync/atomic"
	"time"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// maxQueryID is the exclusive upper bound tonutils enforces on HighloadV3
// query ids: SpecHighloadV3.BuildMessage rejects queryID >= 1<<23.
const maxQueryID = 1 << 23

const (
	// messageTTL is the HighloadV3 message timeout: the wallet accepts a message only while
	// the chain time is less than its created_at plus this timeout.
	messageTTL = 120 * time.Second
	// createdAtBackdate is subtracted from the wall clock when stamping a message's created_at,
	// so the wallet does not reject it as created in the future when the chain time lags behind.
	createdAtBackdate = 30 * time.Second
)

// WalletVersion is the HighloadV3 wallet config used by the relayer.
// It has a query-id source that is safe for concurrent senders: an atomic counter captured
// by the MessageBuilder closure, so ids never repeat until the 23-bit space wraps.
// The counter is seeded randomly so a restarted process does not replay ids
// its previous incarnation used, which the wallet would reject as
// already-executed while still within the dedup window.
var WalletVersion = func() wallet.ConfigHighloadV3 {
	var queryID atomic.Uint32
	//nolint:gosec // the seed is not security-sensitive; it only needs to avoid replaying the previous process's counter position, and query ids are public on-chain anyway
	queryID.Store(rand.Uint32N(maxQueryID))
	return wallet.ConfigHighloadV3{
		MessageTTL: uint32(messageTTL / time.Second),
		MessageBuilder: func(ctx context.Context, subWalletId uint32) (id uint32, createdAt int64, err error) {
			tm := time.Now().Add(-createdAtBackdate).Unix()
			return queryID.Add(1) & (maxQueryID - 1), tm, nil
		}}
}()

// highloadV3ExternalBody is the body of an external message to a HighloadV3 wallet.
type highloadV3ExternalBody struct {
	Signature []byte            `tlb:"bits 512"`
	Payload   highloadV3Payload `tlb:"^"`
}

// highloadV3Payload is the signed part of an external message to a HighloadV3 wallet.
type highloadV3Payload struct {
	SubwalletID uint32     `tlb:"## 32"`
	Message     *cell.Cell `tlb:"^"`
	SendMode    uint8      `tlb:"## 8"`
	QueryID     uint32     `tlb:"## 23"`
	CreatedAt   uint64     `tlb:"## 64"`
	Timeout     uint32     `tlb:"## 22"`
}

// HighloadV3MessageWindow returns the chain times between which a HighloadV3 wallet accepts the
// signed external message ext: from its created_at (inclusive) until created_at plus its
// timeout (exclusive).
func HighloadV3MessageWindow(ext *tlb.ExternalMessage) (createdAt, expiresAt time.Time, err error) {
	if ext.Body == nil {
		return time.Time{}, time.Time{}, errors.New("external message has no body")
	}
	var body highloadV3ExternalBody
	if err = tlb.Parse(&body, ext.Body); err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("failed to parse HighloadV3 external message body: %w", err)
	}

	createdAt = time.Unix(int64(body.Payload.CreatedAt), 0) //nolint:gosec // a unix time stamped from time.Now
	return createdAt, createdAt.Add(time.Duration(body.Payload.Timeout) * time.Second), nil
}
