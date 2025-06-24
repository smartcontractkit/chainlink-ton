package txm

import (
	"time"

	"github.com/smartcontractkit/chainlink-ton/tonutils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Tx struct {
	Mode            uint8                    // send mode bitmask, controls how the TON message is processed
	From            address.Address          // wallet used to send the message
	To              address.Address          // destination address
	Amount          tlb.Coins                // amount to send
	Body            *cell.Cell               // optional body to attach
	StateInit       *cell.Cell               // optional, for deploying new contracts
	Bounceable      bool                     // whether the destination is bounceable
	CreatedAt       time.Time                // when the tx was first enqueued
	Expiration      time.Time                // expiration timestamp based on TTL
	ReceivedMessage tonutils.ReceivedMessage // received message
}
