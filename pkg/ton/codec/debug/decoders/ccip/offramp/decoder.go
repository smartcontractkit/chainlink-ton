package offramp

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var TLBs = offramp.TLBs

type decoder struct {
	tlbsCtx tvm.TLBMap
}

func NewDecoder(tlbsCtx tvm.TLBMap) lib.ContractDecoder {
	return &decoder{tlbsCtx}
}

func (d *decoder) ContractType() string {
	return bindings.TypeOffRamp
}

func (d *decoder) EventInfo(dstAddr *address.Address, msg *cell.Cell) (lib.MessageInfo, error) {
	bucket := event.NewExtOutLogBucket(dstAddr)
	topic, err := bucket.DecodeEventTopic()
	if err != nil {
		return nil, codec.ErrUnknownMessage
	}

	switch topic {
	case offramp.TopicExecutionStateChanged:
		var eventData offramp.ExecutionStateChanged
		if err := tlb.LoadFromCell(&eventData, msg.BeginParse()); err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("ExecutionStateChanged", eventData)
	case offramp.TopicCommitReportAccepted:
		var eventData offramp.CommitReportAccepted
		if err := tlb.LoadFromCell(&eventData, msg.BeginParse()); err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("CommitReportAccepted", eventData)
	case offramp.TopicSourceChainSelectorAdded:
		var eventData offramp.SourceChainSelectorAdded
		if err := tlb.LoadFromCell(&eventData, msg.BeginParse()); err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("SourceChainSelectorAdded", eventData)
	case offramp.TopicSourceChainConfigUpdated:
		var eventData offramp.SourceChainConfigUpdated
		if err := tlb.LoadFromCell(&eventData, msg.BeginParse()); err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("SourceChainConfigUpdated", eventData)
	case offramp.TopicDynamicConfigSet:
		var eventData offramp.DynamicConfigSet
		if err := tlb.LoadFromCell(&eventData, msg.BeginParse()); err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("DynamicConfigSet", eventData)
	case offramp.TopicReceiveExecutorInitExecuteBounced:
		var eventData offramp.ReceiveExecutorInitExecuteBounced
		if err := tlb.LoadFromCell(&eventData, msg.BeginParse()); err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("ReceiveExecutorInitExecuteBounced", eventData)
	case offramp.TopicDeployableInitializeBounced:
		var eventData offramp.DeployableInitializeBounced
		if err := tlb.LoadFromCell(&eventData, msg.BeginParse()); err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("DeployableInitializeBounced", eventData)
	case offramp.TopicRouteMessageBounced:
		var eventData offramp.RouteMessageBounced
		if err := tlb.LoadFromCell(&eventData, msg.BeginParse()); err != nil {
			return nil, err
		}
		return lib.NewMessageInfo("RouteMessageBounced", eventData)
	default:
		return nil, codec.ErrUnknownMessage
	}
}

func (d *decoder) ExternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return nil, codec.ErrUnknownMessage
}

func (d *decoder) InternalMessageInfo(msg *cell.Cell) (lib.MessageInfo, error) {
	return lib.NewMessageInfoFromCell(d.ContractType(), msg, TLBs, d.tlbsCtx)
}

func (d *decoder) ExitCodeInfo(exitCode tvm.ExitCode) (string, error) {
	ec, err := offramp.ExitCodeCodec.NewFrom(exitCode)
	if err != nil {
		return "", codec.ErrUnknownMessage
	}

	return ec.String(), nil
}
