package offramp

import (
	"maps"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/ccip/ccipcommon"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = lib.MustNewTLBMap([]interface{}{
	offramp.Execute{},
	offramp.UpdateSourceChainConfig{},
	offramp.SetOCR3Config{},
	offramp.Commit{},
	offramp.Execute{},
	offramp.CCIPReceive{},
})

type decoder struct {
	tlbs map[uint64]interface{}
}

func NewDecoder(tlbsCtx map[uint64]interface{}) lib.ContractDecoder {
	tlbs := maps.Clone(tlbsCtx)
	maps.Copy(tlbs, TLBs)
	return &decoder{tlbs}
}

// ContractType implements lib.ContractDecoder.
func (d *decoder) ContractType() cldf.ContractType {
	return cldf.ContractType("com.chainlink.ton.ccip.OffRamp")
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
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, d.tlbs)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	return ccipcommon.NewDecoder(d.tlbs).ExitCodeInfo(exitCode)
}
