package jetton

import (
	"fmt"

	"github.com/xssnick/tonutils-go/address"
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
	tlbsCtx map[uint64]interface{}

	contractType cldf.ContractType
}

func NewDecoder(tlbsCtx map[uint64]interface{}, t cldf.ContractType) lib.ContractDecoder {
	return &decoder{tlbsCtx: tlbsCtx, contractType: t}
}

// ContractType implements lib.ContractDecoder.
func (d *decoder) ContractType() cldf.ContractType {
	return cldf.ContractType("com.github.ton-blockchain.jetton-contract.contracts.jetton-wallet")
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
	typeName, norm, err := lib.DecodeTLBValToJSON(msg, TLBs)
	if err != nil {
		return nil, fmt.Errorf("failed to decode message for contract %s: %w", d.ContractType(), err)
	}

	if typeName == "Cell" { // on decoder fallback (not decoded)
		return nil, &lib.UnknownMessageError{}
	}

	return lib.NewMessageInfoFrom(d.ContractType(), norm, d.tlbsCtx)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	ec, err := jetton.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return "", &lib.UnknownMessageError{}
	}

	return ec.String(), nil
}
