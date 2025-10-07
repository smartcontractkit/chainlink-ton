package onramp

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/decoders/ccip/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
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

		ccipMessageSent, err := onramp.Builder.Events.CCIPMessageSent.Decode(msg.BeginParse())
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
	r := msg.BeginParse()
	if r.BitsLeft() == 0 {
		return nil, &lib.UnknownMessageError{}
	}
	opCode, err := r.PreloadUInt(32)
	if err != nil {
		return nil, err
	}
	switch opCode {
	case onramp.OpcodeOnRampSend:
		onRampSend, err := onramp.Builder.Messages.In.OnRampSend.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("OnRampSend", onRampSend)
	case onramp.OpcodeOnRampWithdrawJettons:
		withdrawJettons, err := onramp.Builder.Messages.In.WithdrawJettons.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("WithdrawJettons", withdrawJettons)
	case onramp.OpcodeOnRampExecutorFinishedSuccessfully:
		executorFinished, err := onramp.Builder.Messages.In.ExecutorFinishedSuccessfully.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("ExecutorFinishedSuccessfully", executorFinished)
	case onramp.OpcodeSetDynamicConfig:
		setDynamicConfig, err := onramp.Builder.Messages.In.SetDynamicConfig.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("SetDynamicConfig", setDynamicConfig)
	case onramp.OpcodeUpdateDestChainConfigs:
		updateDestChainConfigs, err := onramp.Builder.Messages.In.UpdateDestChainConfigs.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("UpdateDestChainConfigs", updateDestChainConfigs)
	case onramp.OpcodeUpdateAllowlists:
		updateAllowlists, err := onramp.Builder.Messages.In.UpdateAllowlists.Decode(r)
		if err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("UpdateAllowlists", updateAllowlists)
	}
	return nil, &lib.UnknownMessageError{}
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	return common.NewDecoder().ExitCodeInfo(exitCode)
}
