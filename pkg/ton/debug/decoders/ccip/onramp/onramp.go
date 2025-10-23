package onramp

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/ccip/ccipcommon"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// TODO: auto-generate this map from a set of msgs using TL-B tag to read opcodes
var TLBs = map[int]interface{}{
	onramp.OpcodeOnRampSend:                         onramp.Send{},
	onramp.OpcodeOnRampWithdrawJettons:              onramp.WithdrawJettons{},
	onramp.OpcodeOnRampExecutorFinishedSuccessfully: onramp.ExecutorFinishedSuccessfully{},
	onramp.OpcodeSetDynamicConfig:                   onramp.SetDynamicConfigMessage{},
	onramp.OpcodeUpdateDestChainConfigs:             onramp.UpdateDestChainConfigsMessage{},
	onramp.OpcodeUpdateAllowlists:                   onramp.UpdateAllowlistsMessage{},
}

type decoder struct {
	payloadDecoders map[cldf.ContractType]lib.ContractDecoder
}

func NewDecoder(payloadDecoders map[cldf.ContractType]lib.ContractDecoder) lib.ContractDecoder {
	return &decoder{payloadDecoders}
}

// ContractType implements lib.ContractDecoder.
func (d *decoder) ContractType() cldf.ContractType {
	return cldf.ContractType("com.chainlink.ton.ccip.OnRamp")
}

// EventInfo implements lib.ContractDecoder.
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

// ExternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, &lib.UnknownMessageError{}
}

// InternalMessageInfo implements lib.ContractDecoder.
func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	return ccipcommon.NewDecoder().ExitCodeInfo(exitCode)
}
