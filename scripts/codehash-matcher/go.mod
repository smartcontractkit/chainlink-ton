module ton-getter

go 1.24.5

toolchain go1.24.7

replace github.com/smartcontractkit/chainlink-ton => ../..

require (
	github.com/smartcontractkit/chainlink-ton v0.0.0-00010101000000-000000000000
	github.com/xssnick/tonutils-go v1.15.0
)

require filippo.io/edwards25519 v1.1.0 // indirect
