module github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ocr/testdata/legacyexecutereport

go 1.26.2

// Keep this tool outside the cciplib module so its import resolves to the
// binding before OffChainTokenData changed to a nested LispList.
// Pinned to commit 7f72e847b2fb (tag: contracts/1.6.2+7f72e847b2fb), the last
// commit on main before PR #884 introduced the nested LispList[LispList[SnakeBytes]].
// At that commit, OffChainTokenData was *cell.Cell (hardcoded to tvm.EmptyCell
// for tokenless reports), which produces the same empty cell as the current
// canonicalization. This commit is on main, so the Go module proxy can resolve it.
require github.com/smartcontractkit/chainlink-ton/cciplib v0.0.0-20260915153529-7f72e847b2fb

require (
	github.com/smartcontractkit/chain-selectors v1.0.98
	github.com/smartcontractkit/chainlink-common v0.11.2-0.20260407150650-8115835abd6e
	github.com/xssnick/tonutils-go v1.14.1 // indirect
)

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/ethereum/go-ethereum v1.17.2 // indirect
	github.com/holiman/uint256 v1.3.2 // indirect
	github.com/mr-tron/base58 v1.2.0 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/samber/lo v1.52.0 // indirect
	github.com/sigurn/crc16 v0.0.0-20211026045750-20ab5afb07e3 // indirect
	github.com/smartcontractkit/libocr v0.0.0-20250912173940-f3ab0246e23d // indirect
	go.opentelemetry.io/otel v1.44.0 // indirect
	go.opentelemetry.io/otel/trace v1.44.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	go.uber.org/zap v1.27.1 // indirect
	golang.org/x/crypto v0.54.0 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/text v0.40.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)
