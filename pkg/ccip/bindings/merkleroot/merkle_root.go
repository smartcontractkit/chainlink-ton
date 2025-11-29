package merkleroot

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
)

type Storage struct {
	Root                  *big.Int         `tlb:"## 256"`
	Owner                 *address.Address `tlb:"addr"`
	Timestamp             uint64           `tlb:"## 64"`
	MinMsgNr              uint64           `tlb:"## 64"`
	MaxMsgNr              uint64           `tlb:"## 64"`
	MessageStates         *big.Int         `tlb:"## 128"`
	DeliveredMessageCount uint16           `tlb:"## 16"`
}
