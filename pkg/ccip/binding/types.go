package binding

import (
	"math/big"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

type GenericExtraArgsV2 struct {
	GasLimit                 *big.Int `tlb:"## 256"`
	AllowOutOfOrderExecution bool     `tlb:"bool"`
}

type SVMExtraArgsV1 struct {
	ComputeUnits             uint32     `tlb:"## 32"`
	AccountIsWritableBitmap  uint64     `tlb:"## 64"`
	AllowOutOfOrderExecution bool       `tlb:"bool"`
	TokenReceiver            []byte     `tlb:"bits 256"`
	Accounts                 *cell.Cell `tlb:"^"` //[][32]byte
}
