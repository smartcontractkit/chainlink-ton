package bindings

import "github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorBelowOperationalBalance)
		ecMax = int32(ErrorBelowOperationalBalance)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	ErrorBelowOperationalBalance ExitCode = iota + 70400
)
