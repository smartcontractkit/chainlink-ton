package receiver

import (
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

// Storage represents the storage structure for the CCIP receiver contract.
type Storage struct {
	ID               uint32              `tlb:"## 32"`
	Ownable          common.Ownable2Step `tlb:"."`
	AuthorizedCaller *address.Address    `tlb:"addr"`
	Behavior         uint8               `tlb:"## 8"`
}
