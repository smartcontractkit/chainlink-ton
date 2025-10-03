package onramp

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

var Builder = builder{
	Messages: messageBuilder{
		In: inMessageBuilder{
			OnRampSend:                   codec.TLBCodec[Send](),
			WithdrawJettons:              codec.TLBCodec[WithdrawJettons](),
			ExecutorFinishedSuccessfully: codec.TLBCodec[ExecutorFinishedSuccessfully](),
			SetDynamicConfig:             codec.TLBCodec[SetDynamicConfigMessage](),
			UpdateDestChainConfigs:       codec.TLBCodec[UpdateDestChainConfigsMessage](),
			UpdateAllowlists:             codec.TLBCodec[UpdateAllowlistsMessage](),
		},
	},
}

type inMessageBuilder struct {
	OnRampSend                   codec.CellCodec[Send]
	WithdrawJettons              codec.CellCodec[WithdrawJettons]
	ExecutorFinishedSuccessfully codec.CellCodec[ExecutorFinishedSuccessfully]
	SetDynamicConfig             codec.CellCodec[SetDynamicConfigMessage]
	UpdateDestChainConfigs       codec.CellCodec[UpdateDestChainConfigsMessage]
	UpdateAllowlists             codec.CellCodec[UpdateAllowlistsMessage]
}

type messageBuilder struct {
	In inMessageBuilder
}

type builder struct {
	Messages messageBuilder
}
