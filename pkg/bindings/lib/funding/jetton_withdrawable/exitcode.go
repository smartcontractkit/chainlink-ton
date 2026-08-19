package jetton_withdrawable

import "github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ZeroAddressNotAllowed)
		ecMax = int32(InvalidWithdrawWallet)
	)

	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	// ZeroAddressNotAllowed is thrown when a withdrawal would relay to the zero/none address.
	// Facility ID 557 * 100 = 55700.
	ZeroAddressNotAllowed ExitCode = iota + 55700
	// UnallowedRecipient is thrown when a transfer does not target an allowlisted recipient
	// (or carries a non-empty customPayload).
	UnallowedRecipient
	// MaxAmountExceeded is thrown when a transfer's jetton amount exceeds the caller-allowed max.
	MaxAmountExceeded
	// InsufficientValue is thrown when the inbound message value cannot cover the relayed
	// transfer values plus the pool reserve.
	InsufficientValue
	// InvalidWithdrawWallet is thrown when the request is malformed.
	InvalidWithdrawWallet
)
