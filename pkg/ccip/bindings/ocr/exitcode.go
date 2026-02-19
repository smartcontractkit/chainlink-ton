package ocr

import "github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorBigFMustBePositive)
		ecMax = int32(ErrorNoSigners)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	ErrorBigFMustBePositive ExitCode = iota + 54500 // Facility ID * 100
	ErrorStaticConfigCannotBeChanged
	ErrorTooManySigners
	ErrorBigFTooHigh
	ErrorTooManyTransmitters
	ErrorNoTransmitters
	ErrorRepeatedSigners
	ErrorRepeatedTransmitters
	ErrorConfigDigestMismatch
	ErrorUnauthorizedTransmitter
	ErrorWrongNumberOfSignatures
	ErrorUnauthorizedSigner
	ErrorNonUniqueSignatures
	ErrorInvalidSignature
	ErrorNonExistentOcrPluginType
	ErrorNoSigners
)
