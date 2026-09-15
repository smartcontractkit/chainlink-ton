module github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ocr/testdata/legacyexecutereport

go 1.26.2

// Keep this tool outside the cciplib module so its import resolves to the
// binding before OffChainTokenData changed to a nested LispList.
require github.com/smartcontractkit/chainlink-ton/cciplib v0.0.0-20260914214413-1f3ac22e4746

require github.com/xssnick/tonutils-go v1.14.1

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/sigurn/crc16 v0.0.0-20211026045750-20ab5afb07e3 // indirect
	golang.org/x/crypto v0.54.0 // indirect
)
