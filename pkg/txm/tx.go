package txm

import (
	"time"

	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type TONTx struct {
	From             address.Address // wallet used to send the message
	To               address.Address // destination address
	Amount           tlb.Coins       // amount to send
	Body             *cell.Cell      // optional body to attach
	StateInit        *cell.Cell      // optional, for deploying new contracts
	Bounceable       bool            // whether the destination is bounceable
	Attempt          uint64          // how many times we've retried sending
	CreatedAt        time.Time       // when the tx was first enqueued
	Expiration       time.Time       // expiration timestamp based on TTL
	EstimateGas      bool            // whether to simulate before sending
	MsgHash          string          // optional: unique ID or message hash
	OutOfTimeErrors  uint            // optional: counter of out-of-time errors if modeled
	Status           commontypes.TransactionStatus
	LT               uint64 // Lamport Time
	OutgoingMessages []tlb.Message
}
