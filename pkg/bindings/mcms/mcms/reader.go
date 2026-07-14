package mcms

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

var GetConfig = tvm.NewNoArgsGetter(tvm.NoArgsOpts[Config]{
	Name: "getConfig",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (Config, error) {
		rResult := r.AsTuple()
		if len(rResult) < 3 { //nolint:mnd // 3 expected return values
			return Config{}, errors.New("error: getConfig returned less than 3 cells")
		}

		keySz := uint(tvm.SizeUINT8)
		_signers := cell.NewDict(keySz)
		if rResult[0] != nil {
			rc0, err := r.Cell(0)
			if err != nil {
				return Config{}, fmt.Errorf("error getting Cell(0) - Config.Signers: %w", err)
			}

			if rc0 != nil {
				_signers = rc0.AsDict(keySz)
			}
		}

		_groupQuorums := cell.NewDict(keySz)
		if rResult[1] != nil {
			rc1, err := r.Cell(1)
			if err != nil {
				return Config{}, fmt.Errorf("error getting Cell(1) - Config.GroupQuorums: %w", err)
			}

			if rc1 != nil {
				_groupQuorums = rc1.AsDict(keySz)
			}
		}

		_groupParents := cell.NewDict(keySz)
		if rResult[2] != nil {
			rc2, err := r.Cell(2) //nolint:mnd // 2 index for 3rd return value
			if err != nil {
				return Config{}, fmt.Errorf("error getting Cell(2) - Config.GroupParents: %w", err)
			}

			if rc2 != nil {
				_groupParents = rc2.AsDict(keySz)
			}
		}

		signers, err := tlbe.NewDictFromDictionary[uint8, Signer](_signers)
		if err != nil {
			return Config{}, fmt.Errorf("error decoding Config.Signers dict: %w", err)
		}

		groupQuorums, err := tlbe.NewDictFromDictionary[uint8, uint8](_groupQuorums)
		if err != nil {
			return Config{}, fmt.Errorf("error decoding Config.GroupQuorums dict: %w", err)
		}

		groupParents, err := tlbe.NewDictFromDictionary[uint8, uint8](_groupParents)
		if err != nil {
			return Config{}, fmt.Errorf("error decoding Config.GroupParents dict: %w", err)
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
			return 0, fmt.Errorf("error getting Int(0) - opCount: %w", err)
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

var GetOpPendingInfo = tvm.NewNoArgsGetter(tvm.NoArgsOpts[OpPendingInfo]{
	Name: "getOpPendingInfo",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (OpPendingInfo, error) {
		validAfter, err := r.Int(0)
		if err != nil {
			return OpPendingInfo{}, fmt.Errorf("error getting Int(0) - validAfter: %w", err)
		}

		opFinalizationTimeout, err := r.Int(1)
		if err != nil {
			return OpPendingInfo{}, fmt.Errorf("error getting Int(1) - opFinalizationTimeout: %w", err)
		}

		// Check for maybe (nil) address
		var opPendingReceiver *address.Address
		isNil, err := r.IsNil(2)
		if err != nil {
			return OpPendingInfo{}, fmt.Errorf("error checking IsNil(2) - opPendingReceiver: %w", err)
		}

		if !isNil {
			sAddr, err := r.Slice(2) //nolint:govet // allow err shadowing
			if err != nil {
				return OpPendingInfo{}, fmt.Errorf("error getting Slice(2) - opPendingReceiver: %w", err)
			}

			opPendingReceiver, err = sAddr.LoadAddr()
			if err != nil {
				return OpPendingInfo{}, fmt.Errorf("error decoding Slice(2) - opPendingReceiver: %w", err)
			}
		}

		opPendingBodyTruncated, err := r.Int(3)
		if err != nil {
			return OpPendingInfo{}, fmt.Errorf("error getting Int(3) - opPendingBodyTruncated: %w", err)
		}

		return OpPendingInfo{
			ValidAfter:             validAfter.Uint64(),
			OpFinalizationTimeout:  uint32(opFinalizationTimeout.Uint64()),
			OpPendingReceiver:      opPendingReceiver,
			OpPendingBodyTruncated: tlbe.NewUint256(opPendingBodyTruncated),
		}, nil
	}),
})

var GetRootMetadata = tvm.NewNoArgsGetter(tvm.NoArgsOpts[RootMetadata]{
	Name: "getRootMetadata",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (RootMetadata, error) {
		chainID, err := r.Int(0)
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error getting Int(0) - chainID: %w", err)
		}

		sAddr, err := r.Slice(1)
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error getting Slice(1) - addr: %w", err)
		}

		addr, err := sAddr.LoadAddr()
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error decoding Slice(1) - addr: %w", err)
		}

		preOpCount, err := r.Int(2)
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error getting Int(2) - preOpCount: %w", err)
		}

		postOpCount, err := r.Int(3)
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error getting Int(3) - postOpCount: %w", err)
		}

		rs, err := r.Int(4)
		if err != nil {
			return RootMetadata{}, fmt.Errorf("error getting Int(4) - overridePreviousRoot: %w", err)
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

var GetOracle = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*address.Address]{
	Name: "getOracle",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		sAddr, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - oracle: %w", err)
		}

		oracle, err := sAddr.LoadAddr()
		if err != nil {
			return nil, fmt.Errorf("error decoding Slice(0) - oracle: %w", err)
		}

		return oracle, nil
	}),
})

// --- Getters - Ownable2Step ---

var (
	GetOwner        = ownable2step.GetOwner
	GetPendingOwner = ownable2step.GetPendingOwner
)
