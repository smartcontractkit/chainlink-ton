package wrappers

type LazyLoadingContract[T any] struct {
	LazyLoadingBit bool `tlb:"bool"`
	Contract       T    `tlb:"."`
}

// Wraps a contract with a lazy loading bit.
// This is useful for Tact contracts that require a lazy loading bit to be set to false.
func LazyLoadingTactContractInitData[T any](contract T) LazyLoadingContract[T] {
	return LazyLoadingContract[T]{
		LazyLoadingBit: false,
		Contract:       contract,
	}
}
