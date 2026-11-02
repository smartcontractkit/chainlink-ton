package config

import (
	"context"
	"math/rand/v2"
	"sync/atomic"
	"time"

	"github.com/xssnick/tonutils-go/ton/wallet"
)

// maxQueryID is the exclusive upper bound tonutils enforces on HighloadV3
// query ids: SpecHighloadV3.BuildMessage rejects queryID >= 1<<23.
const maxQueryID = 1 << 23

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
		MessageTTL: 120,
		MessageBuilder: func(ctx context.Context, subWalletId uint32) (id uint32, createdAt int64, err error) {
			tm := time.Now().Unix() - 30
			return queryID.Add(1) & (maxQueryID - 1), tm, nil
		}}
}()
