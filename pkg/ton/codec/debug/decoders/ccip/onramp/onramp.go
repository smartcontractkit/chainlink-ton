package onramp

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/decoders/ccip/ccipcommon"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = onramp.TLBs

type decoder struct {
	tlbsCtx tvm.TLBMap
}

func NewDecoder(tlbsCtx tvm.TLBMap) lib.ContractDecoder {
	return &decoder{tlbsCtx}
}

func (d *decoder) ContractType() tvm.FullyQualifiedName {
	return bindings.TypeOnRamp
}

func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	bucket := event.NewExtOutLogBucket(dstAddr)
	topic, err := bucket.DecodeEventTopic()
	if err != nil {
		return nil, codec.ErrUnknownMessage
	}
	if topic == onramp.TopicCCIPMessageSent {
		var ccipMessageSent onramp.CCIPMessageSent
		err := tlb.LoadFromCell(&ccipMessageSent, msg.BeginParse())
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("CCIPMessageSent", ccipMessageSent)
	}

	return nil, codec.ErrUnknownMessage
}

func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, codec.ErrUnknownMessage
}

func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs, d.tlbsCtx)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	return ccipcommon.NewDecoder(d.tlbsCtx).ExitCodeInfo(exitCode)
}
