package feequoter

import "math/big"

// PackGasPrice packs execution and data availability gas prices into a single 224-bit value.
// The packed format is: (dataAvailabilityGasPrice << 112) | executionGasPrice
//
// This matches the CCIP commit plugin's FeeComponentsToPackedFee function:
// https://github.com/smartcontractkit/chainlink-ccip/blob/main/commit/chainfee/outcome.go
func PackGasPrice(executionGasPrice, dataAvailabilityGasPrice *big.Int) *big.Int {
	daShifted := new(big.Int).Lsh(dataAvailabilityGasPrice, 112)
	return new(big.Int).Or(daShifted, executionGasPrice)
}

// UnpackGasPrice unpacks a 224-bit packed gas price value into separate execution
// and data availability gas prices.
//
// The packed format is: (dataAvailabilityGasPrice << 112) | executionGasPrice
//
// Returns:
//   - executionGasPrice: the lower 112 bits
//   - dataAvailabilityGasPrice: the upper 112 bits
func UnpackGasPrice(packedPrice *big.Int) (executionGasPrice, dataAvailabilityGasPrice *big.Int) {
	ones112 := big.NewInt(0)
	for i := 0; i < 112; i++ {
		ones112 = ones112.SetBit(ones112, i, 1)
	}

	executionGasPrice = new(big.Int).And(packedPrice, ones112)
	dataAvailabilityGasPrice = new(big.Int).Rsh(packedPrice, 112)

	return executionGasPrice, dataAvailabilityGasPrice
}
