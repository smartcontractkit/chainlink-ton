package mcms

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var GetConfig = tvm.NewNoArgsGetter(tvm.NoArgsOpts[Config]{
	Name: "getConfig",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (Config, error) {
		rResult := r.AsTuple()
		if len(rResult) < 3 { //nolint:mnd // 3 expected return values
			return Config{}, errors.New("error: getConfig returned less than 3 cells")
		}

		keySz := uint(tvm.SizeUINT8)
		signers := cell.NewDict(keySz)
		if rResult[0] != nil {
			rc0, err := r.Cell(0)
			if err != nil {
				return Config{}, fmt.Errorf("error getting Config.Signers cell(0): %w", err)
			}

			if rc0 != nil {
				signers = rc0.AsDict(keySz)
			}
		}

		groupQuorums := cell.NewDict(keySz)
		if rResult[1] != nil {
			rc1, err := r.Cell(1)
			if err != nil {
				return Config{}, fmt.Errorf("error getting Config.GroupQuorums cell(1): %w", err)
			}

			if rc1 != nil {
				groupQuorums = rc1.AsDict(keySz)
			}
		}

		groupParents := cell.NewDict(keySz)
		if rResult[2] != nil {
			rc2, err := r.Cell(2) //nolint:mnd // 2 index for 3rd return value
			if err != nil {
				return Config{}, fmt.Errorf("error getting Config.GroupParents cell(2): %w", err)
			}

			if rc2 != nil {
				groupParents = rc2.AsDict(keySz)
			}
		}

		return Config{
			Signers:      signers,
			GroupQuorums: groupQuorums,
			GroupParents: groupParents,
		}, nil

	}),
})

var GetOpCount = tvm.NewNoArgsGetter(tvm.NoArgsOpts[uint64]{
	Name: "getOpCount",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (uint64, error) {
		ri, err := r.Int(0)
		if err != nil {
			return 0, fmt.Errorf("error getting opCount slice: %w", err)
		}

		return ri.Uint64(), nil
	}),
})

type GetRootResult struct {
	Root       *big.Int
	ValidUntil uint32
}

var GetRoot = tvm.NewNoArgsGetter(tvm.NoArgsOpts[GetRootResult]{
	Name: "getRoot",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (GetRootResult, error) {
		root, err := r.Int(0)
		if err != nil {
			return GetRootResult{}, fmt.Errorf("error getting Int(0) - root: %w", err)
		}

		validUntil, err := r.Int(1)
		if err != nil {
			return GetRootResult{}, fmt.Errorf("error getting Int(1) - validUntil: %w", err)
		}

		return GetRootResult{
			Root:       root,
			ValidUntil: uint32(validUntil.Uint64()),
		}, nil
	}),
})

var GetRootMetadata = tvm.NewNoArgsGetter(tvm.NoArgsOpts[RootMetadata]{
	Name: "getRootMetadata",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (RootMetadata, error) {
		chainID, err := r.Int(0)
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error getting chainID int: %w", err)
		}

		// Notice: encoded as cell, when returned within a struct vs. slice when returned alone
		cAddr, err := r.Cell(1)
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error decoding MultiSig addr result: %w", err)
		}

		addr, err := cAddr.BeginParse().LoadAddr()
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error decoding MultiSig addr result slice: %w", err)
		}

		preOpCount, err := r.Int(2)
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error getting preOpCount int: %w", err)
		}

		postOpCount, err := r.Int(3)
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error getting postOpCount int: %w", err)
		}

		rs, err := r.Int(4)
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error getting overridePreviousRoot bool result: %w", err)
		}
		overridePreviousRoot := rs.Uint64() == 1

		return RootMetadata{
			ChainID:              chainID,
			MultiSig:             addr,
			PreOpCount:           preOpCount.Uint64(),
			PostOpCount:          postOpCount.Uint64(),
			OverridePreviousRoot: overridePreviousRoot,
		}, nil
	}),
})
