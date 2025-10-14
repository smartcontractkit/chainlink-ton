package jetton

import (
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type decoder struct {
}

func NewDecoder() *decoder {
	return &decoder{}
}

// InternalMessageInfo implements lib.ContractDecoder.
func (j *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	r := msg.BeginParse()
	if r.BitsLeft() == 0 {
		return nil, &lib.UnknownMessageError{}
	}
	opCode, err := r.PreloadUInt(32)
	if err != nil {
		return nil, err
	}
	if opCode == jetton.OpcodeTopUp {
		var topUp jetton.TopUpMessage
		err := tlb.LoadFromCell(&topUp, r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("TopUp", topUp)
	}
	return nil, &lib.UnknownMessageError{}
}

func (j *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	switch exitCode {
	case jetton.ErrorInvalidOp:
		return "ErrorInvalidOp", nil
	case jetton.ErrorWrongOp:
		return "ErrorWrongOp", nil
	case jetton.ErrorNotOwner:
		return "ErrorNotOwner", nil
	case jetton.ErrorNotValidWallet:
		return "ErrorNotValidWallet", nil
	case jetton.ErrorWrongWorkchain:
		return "ErrorWrongWorkchain", nil
	default:
		return "", &lib.UnknownMessageError{}
	}
}
