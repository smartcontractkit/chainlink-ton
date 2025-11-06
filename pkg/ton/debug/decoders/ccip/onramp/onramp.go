package onramp

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/ccip/ccipcommon"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = lib.MustNewTLBMap([]interface{}{
	onramp.Send{},
	onramp.WithdrawJettons{},
	onramp.ExecutorFinishedSuccessfully{},
	onramp.ExecutorFinishedWithError{},
	onramp.SetDynamicConfigMessage{},
	onramp.UpdateDestChainConfigsMessage{},
	onramp.UpdateAllowlistsMessage{},
})

type decoder struct {
	tlbsCtx map[uint64]interface{}
}

func NewDecoder(tlbsCtx map[uint64]interface{}) lib.ContractDecoder {
	return &decoder{tlbsCtx}
}

func (d *decoder) ContractType() string {
	return "com.chainlink.ton.ccip.OnRamp"
}

func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	bucket := event.NewExtOutLogBucket(dstAddr)
	topic, err := bucket.DecodeEventTopic()
	if err != nil {
		return nil, &lib.UnknownMessageError{}
	}
	if topic == onramp.TopicCCIPMessageSent {
		var ccipMessageSent onramp.CCIPMessageSent
		err := tlb.LoadFromCell(&ccipMessageSent, msg.BeginParse())
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("CCIPMessageSent", ccipMessageSent)
	}

	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs, d.tlbsCtx)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	return ccipcommon.NewDecoder(d.tlbsCtx).ExitCodeInfo(exitCode)
}
