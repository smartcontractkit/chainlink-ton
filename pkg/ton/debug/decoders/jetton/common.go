package jetton

import (
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = lib.MustNewTLBMap([]interface{}{
	jetton.TopUpMessage{},
})

type decoder struct {
	contractType cldf.ContractType
}

func NewDecoder(t cldf.ContractType) *decoder {
	return &decoder{contractType: t}
}

// InternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.contractType, msg, TLBs)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
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
