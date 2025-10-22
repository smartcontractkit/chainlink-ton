package ccipsendexecutor

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ccipsendexecutor"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type decoder struct {
	payloadDecoders map[cldf.ContractType]lib.ContractDecoder
}

func NewDecoder(payloadDecoders map[cldf.ContractType]lib.ContractDecoder) lib.ContractDecoder {
	return &decoder{payloadDecoders}
}

// ContractType implements lib.ContractDecoder.
func (d *decoder) ContractType() cldf.ContractType {
	return cldf.ContractType("com.chainlink.ton.ccip.CCIPSendExecutor")
}

// EventInfo implements lib.ContractDecoder.
func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// ExternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// InternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	r := msg.BeginParse()
	if r.BitsLeft() == 0 {
		return nil, &lib.UnknownMessageError{}
	}
	opCode, err := r.PreloadUInt(32)
	if err != nil {
		return nil, err
	}
	if opCode == ccipsendexecutor.OpcodeCCIPSendExecutorExecute {
		var execute ccipsendexecutor.Execute
		err := tlb.LoadFromCell(&execute, r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("CCIPSendExecutorExecute", execute)
	}

	// Note: We don't handle JettonTransferNotification or FeeQuoter_MessageValidated here
	// because they are already handled by their respective decoders (jetton wallet and fee quoter)
	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	switch exitCode {
	case ccipsendexecutor.ErrorStateNotExpected:
		return "ErrorStateNotExpected", nil
	case ccipsendexecutor.ErrorUnauthorized:
		return "ErrorUnauthorized", nil
	default:
		return "", &lib.UnknownMessageError{}
	}
}
