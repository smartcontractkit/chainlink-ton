package binding

import (
	"math/big"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

type GenericExtraArgsV2 struct {
	GasLimit                 *big.Int `tlb:"## 256"`
	AllowOutOfOrderExecution bool     `tlb:"bool"`
}

type TLBSVMExtraArgsV1 struct {
	ComputeUnits             uint32     `tlb:"## 32"`
	AccountIsWritableBitmap  uint64     `tlb:"## 64"`
	AllowOutOfOrderExecution bool       `tlb:"bool"`
	TokenReceiver            []byte     `tlb:"bits 256"`
	Accounts                 *cell.Cell `tlb:"^"` //[][32]byte
}

type SVMExtraArgsV1 struct {
	ComputeUnits             uint32
	AccountIsWritableBitmap  uint64
	AllowOutOfOrderExecution bool
	TokenReceiver            []byte
	Accounts                 [][]byte
}

func (s *TLBSVMExtraArgsV1) ExportSVMExtraArgsV1() (SVMExtraArgsV1, error) {
	accounts, err := Unpack2DByteArrayFromCell(s.Accounts)
	if err != nil {
		return SVMExtraArgsV1{}, err
	}

	return SVMExtraArgsV1{
		ComputeUnits:             s.ComputeUnits,
		AccountIsWritableBitmap:  s.AccountIsWritableBitmap,
		AllowOutOfOrderExecution: s.AllowOutOfOrderExecution,
		TokenReceiver:            s.TokenReceiver,
		Accounts:                 accounts,
	}, nil
}
