package ccipsendexecutor

import (
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// CCIPSend Executor opcodes
const (
	OpcodeCCIPSendExecutorExecute = 0xAF3C62B3 // crc32('CCIPSendExecutor_Execute')
)

// CCIPSend Executor exit codes
const (
	ErrorStateNotExpected tvm.ExitCode = tvm.ExitCode(500)
	ErrorUnauthorized     tvm.ExitCode = tvm.ExitCode(265) // ERROR_UNAUTHORIZED from contract
)

var Builder = builder{
	Messages: messageBuilder{
		In: inMessageBuilder{
			Execute: codec.TLBCodec[Execute](),
		},
	},
}

type inMessageBuilder struct {
	Execute codec.CellCodec[Execute]
}

type messageBuilder struct {
	In inMessageBuilder
}

type builder struct {
	Messages messageBuilder
}
