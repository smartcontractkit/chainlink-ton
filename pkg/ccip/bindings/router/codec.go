package router

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// Router opcodes
const (
	OpcodeSetRamps = 0x10000001
	OpcodeCCIPSend = 0x00000001
)

// Router exit codes
const (
	ErrorDestChainNotEnabled tvm.ExitCode = tvm.ExitCode(0x1001)
	ErrorUnknownMessage      tvm.ExitCode = tvm.ExitCode(0x1002)
)

var Builder = builder{
	Messages: messageBuilder{
		In: inMessageBuilder{
			SetRamps: codec.TLBCodec[SetRamps](),
			CCIPSend: codec.TLBCodec[CCIPSend](),
		},
	},
}

type inMessageBuilder struct {
	SetRamps codec.CellCodec[SetRamps]
	CCIPSend codec.CellCodec[CCIPSend]
}

type messageBuilder struct {
	In inMessageBuilder
}

type builder struct {
	Messages messageBuilder
}
