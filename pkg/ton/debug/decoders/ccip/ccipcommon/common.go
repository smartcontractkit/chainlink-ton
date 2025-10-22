package ccipcommon

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type decoder struct {
}

// EventInfo implements lib.ContractDecoder.
func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// ExitCodeInfo implements lib.ContractDecoder.
func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	switch exitCode {
	case common.ErrUnknownDestChainSelector:
		return "ErrUnknownDestChainSelector", nil
	case common.DestChainNotEnabled:
		return "DestChainNotEnabled", nil
	case common.FeeTokenNotSupported:
		return "FeeTokenNotSupported", nil
	case common.StaleGasPrice:
		return "StaleGasPrice", nil
	case common.InvalidMsgData:
		return "InvalidMsgData", nil
	case common.SenderNotAllowed:
		return "SenderNotAllowed", nil
	case common.InvalidMessageDestChainSelector:
		return "InvalidMessageDestChainSelector", nil
	case common.SourceChainSelectorMismatch:
		return "SourceChainSelectorMismatch", nil
	case common.TokenNotSupported:
		return "TokenNotSupported", nil
	case common.Unauthorized:
		return "Unauthorized", nil
	case common.SourceChainNotEnabled:
		return "SourceChainNotEnabled", nil
	case common.EmptyReport:
		return "EmptyReport", nil
	case common.DispatchNotFromMerkleRoot:
		return "DispatchNotFromMerkleRoot", nil
	default:
		return "", &lib.UnknownMessageError{}
	}
}

// ExternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) ExternalMessageInfo(body *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// InternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) InternalMessageInfo(body *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

func NewDecoder() *decoder {
	return &decoder{}
}
