package tokenpool

import "github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorInvalidTransferFeeBps)
		ecMax = int32(ErrorRateLimitExceeded)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	ErrorInvalidTransferFeeBps ExitCode = iota + 14900 // Facility ID 149 * 100
	ErrorInvalidTokenTransferFeeConfig
	ErrorCallerIsNotARampOnRouter
	ErrorZeroAddressInvalid
	ErrorNonExistentChain
	ErrorChainNotAllowed
	ErrorCursedByRMN
	ErrorChainAlreadyExists
	ErrorInvalidSourcePoolAddress
	ErrorInvalidToken
	ErrorUnauthorized
	ErrorPoolAlreadyAdded
	ErrorInvalidRemotePoolForChain
	ErrorInvalidRemoteChainDecimals
	ErrorOverflowDetected
	ErrorInvalidDecimalArgs
	ErrorCallerIsNotOwnerOrFeeAdmin
	ErrorUnsupportedOperation
	ErrorMissingForwardPayload
	ErrorMissingTransferInitiator
	ErrorAmountMismatch
	ErrorInvalidRequestedFinality
	ErrorRateLimitExceeded
)
