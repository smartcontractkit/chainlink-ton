package common //nolint:revive,nolintlint

import (
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// GetTypeAndVersion gets the type and version of the contract
var GetTypeAndVersion = tvm.NewNoArgsGetter(tvm.NoArgsOpts[TypeAndVersion]{
	Name: versionGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (TypeAndVersion, error) {
		var t TypeAndVersion
		typ, err := r.Slice(0)
		if err != nil {
			return t, err
		}
		tStr, err := typ.LoadStringSnake()
		if err != nil {
			return t, err
		}

		version, err := r.Slice(1)
		if err != nil {
			return t, err
		}

		vStr, err := version.LoadStringSnake()
		if err != nil {
			return t, err
		}

		return TypeAndVersion{
			Type:    tStr,
			Version: vStr,
		}, nil
	}),
})
