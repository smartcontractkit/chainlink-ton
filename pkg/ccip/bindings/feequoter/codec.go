package feequoter

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

var Builder = builder{
	Messages: messageBuilder{
		In: inMessageBuilder{
			UpdatePrices:                  codec.TLBCodec[UpdatePrices](),
			UpdateFeeTokens:               codec.TLBCodec[UpdateFeeTokens](),
			UpdateTokenTransferFeeConfigs: codec.TLBCodec[UpdateTokenTransferFeeConfigs](),
			UpdateDestChainConfigs:        codec.TLBCodec[UpdateDestChainConfigs](),
			GetValidatedFee:               codec.TLBCodec[GetValidatedFee](),
		},
		Out: outMessageBuilder{
			MessageValidated: codec.TLBCodec[MessageValidated](),
		},
	},
}

type inMessageBuilder struct {
	UpdatePrices                  codec.CellCodec[UpdatePrices]
	UpdateFeeTokens               codec.CellCodec[UpdateFeeTokens]
	UpdateTokenTransferFeeConfigs codec.CellCodec[UpdateTokenTransferFeeConfigs]
	UpdateDestChainConfigs        codec.CellCodec[UpdateDestChainConfigs]
	GetValidatedFee               codec.CellCodec[GetValidatedFee]
}

type outMessageBuilder struct {
	MessageValidated codec.CellCodec[MessageValidated]
}

type messageBuilder struct {
	In  inMessageBuilder
	Out outMessageBuilder
}

type builder struct {
	Messages messageBuilder
}
