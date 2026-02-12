package feequoter

import (
	"errors"
	"math/big"
)

var (
	// ErrNilGasPrice is returned when a nil gas price is passed to PackGasPrice.
	ErrNilGasPrice = errors.New("gas price cannot be nil")
	// ErrNegativeGasPrice is returned when a negative gas price is passed to PackGasPrice.
	ErrNegativeGasPrice = errors.New("gas price cannot be negative")
	// ErrGasPriceExceeds112Bits is returned when a gas price exceeds 112 bits.
	ErrGasPriceExceeds112Bits = errors.New("gas price exceeds 112 bits")
	// ErrPackedPriceExceeds224Bits is returned when a packed price exceeds 224 bits.
	ErrPackedPriceExceeds224Bits = errors.New("packed price exceeds 224 bits")
	// ErrNilPackedPrice is returned when a nil packed price is passed to UnpackGasPrice.
	ErrNilPackedPrice = errors.New("packed price cannot be nil")
	// ErrNegativePackedPrice is returned when a negative packed price is passed to UnpackGasPrice.
	ErrNegativePackedPrice = errors.New("packed price cannot be negative")

	// Pre-computed bit masks for gas price packing/unpacking
	mask112 = maxUint(112) // 2^112 - 1, used for 112-bit values
	mask224 = maxUint(224) // 2^224 - 1, used for 224-bit packed values
)

// maxUint returns 2^bits - 1, which is the maximum value for an unsigned integer of the given bit length.
// Can also be used as a bit mask with all bits set to 1.
func maxUint(bits uint) *big.Int {
	return new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), bits), big.NewInt(1))
}

// PackGasPrice packs execution and data availability gas prices into a single 224-bit value.
// The packed format is: (dataAvailabilityGasPrice << 112) | executionGasPrice
//
// This matches the CCIP commit plugin's FeeComponentsToPackedFee function:
// https://github.com/smartcontractkit/chainlink-ccip/blob/main/commit/chainfee/outcome.go
//
// Returns an error if:
//   - Either input is nil
//   - Either input is negative
//   - Either input exceeds 112 bits
func PackGasPrice(executionGasPrice, dataAvailabilityGasPrice *big.Int) (*big.Int, error) {
	if executionGasPrice == nil || dataAvailabilityGasPrice == nil {
		return nil, ErrNilGasPrice
	}
	if executionGasPrice.Sign() < 0 || dataAvailabilityGasPrice.Sign() < 0 {
		return nil, ErrNegativeGasPrice
	}
	if executionGasPrice.Cmp(mask112) > 0 {
		return nil, ErrGasPriceExceeds112Bits
	}
	if dataAvailabilityGasPrice.Cmp(mask112) > 0 {
		return nil, ErrGasPriceExceeds112Bits
	}

	daShifted := new(big.Int).Lsh(dataAvailabilityGasPrice, 112)
	return new(big.Int).Or(daShifted, executionGasPrice), nil
}

// UnpackGasPrice unpacks a 224-bit packed gas price value into separate execution
// and data availability gas prices.
//
// The packed format is: (dataAvailabilityGasPrice << 112) | executionGasPrice
//
// Returns an error if:
//   - The input is nil
//   - The input is negative
//   - The input exceeds 224 bits
//
// Returns:
//   - executionGasPrice: the lower 112 bits
//   - dataAvailabilityGasPrice: the upper 112 bits (bits 112-223)
func UnpackGasPrice(packedPrice *big.Int) (executionGasPrice, dataAvailabilityGasPrice *big.Int, err error) {
	if packedPrice == nil {
		return nil, nil, ErrNilPackedPrice
	}
	if packedPrice.Sign() < 0 {
		return nil, nil, ErrNegativePackedPrice
	}
	if packedPrice.Cmp(mask224) > 0 {
		return nil, nil, ErrPackedPriceExceeds224Bits
	}

	executionGasPrice = new(big.Int).And(packedPrice, mask112)
	dataAvailabilityGasPrice = new(big.Int).Rsh(packedPrice, 112)

	return executionGasPrice, dataAvailabilityGasPrice, nil
}
