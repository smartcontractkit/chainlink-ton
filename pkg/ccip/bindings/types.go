package bindings

import (
	"math/big"
)

type GenericExtraArgsV2 struct {
	GasLimit                 *big.Int `tlb:"## 256"`
	AllowOutOfOrderExecution bool     `tlb:"bool"`
}

type SVMExtraArgsV1 struct {
	ComputeUnits             uint32       `tlb:"## 32"`
	AccountIsWritableBitmap  uint64       `tlb:"## 64"`
	AllowOutOfOrderExecution bool         `tlb:"bool"`
	TokenReceiver            []byte       `tlb:"bits 256"`
	Accounts                 SnakeBytes2D `tlb:"^"`
}
