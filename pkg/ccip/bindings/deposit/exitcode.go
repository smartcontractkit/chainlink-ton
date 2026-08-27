package deposit

import "github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode -trimprefix=ExitCode -output=exitcode_string.go
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ExitCodeOnlyOwner)
		ecMax = int32(ExitCodeOnlySendExcessesToSender)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	// Facility ID 525 * 100 = 52500
	ExitCodeOnlyOwner ExitCode = iota + 52500
	ExitCodeOnlyBeneficiary
	ExitCodeOnlySendExcessesToSender
)
