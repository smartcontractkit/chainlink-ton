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

// GetFacilityId gets the facility ID of the FeeQuoter contract
var GetFacilityId = tvm.NewNoArgsGetter(tvm.NoArgsOpts[uint16]{
	Name: facilityIdGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (uint16, error) {
		v, err := r.Int(0)
		if err != nil {
			return 0, err
		}
		return uint16(v.Uint64()), nil
	}),
})

// GetErrorCode gets the contract-specific error code for a given local error code
var GetErrorCode = tvm.Getter[uint16, uint16]{
	Name: errorCodeGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (uint16, error) {
		v, err := r.Int(0)
		if err != nil {
			return 0, err
		}
		return uint16(v.Uint64()), nil
	}),
}
