package mcms

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

func must[E any](out E, err error) E {
	if err != nil {
		panic(err)
	}

	return out
}

func EmptyDataFrom(id uint32, owner *address.Address, chainID int64) Data {
	return Data{
		ID: id,
		Ownable: ownable2step.Storage{
			Owner:        owner,
			PendingOwner: nil,
		},
		Oracle:  owner,
		Signers: must(tvm.MakeDict(map[*big.Int]Signer{}, 160)), // TODO: tvm.KeyUINT160
		Config: Config{
			Signers:      must(tvm.MakeDictFrom([]Signer{}, tvm.KeyUINT8)),
			GroupQuorums: must(tvm.MakeDictFrom([]GroupQuorum{}, tvm.KeyUINT8)),
			GroupParents: must(tvm.MakeDictFrom([]GroupParent{}, tvm.KeyUINT8)),
		},
		SeenSignedHashes: must(tvm.MakeDict(map[*big.Int]SeenSignedHash{}, tvm.KeyUINT256)),
		RootInfo: RootInfo{
			ExpiringRootAndOpCount: ExpiringRootAndOpCount{
				Root:       tlbe.NewUint256(big.NewInt(0)),
				ValidUntil: 0,
				OpCount:    0,
				OpPendingInfo: OpPendingInfo{
					ValidAfter:             0,
					OpFinalizationTimeout:  0,
					OpPendingReceiver:      address.NewAddressNone(),
					OpPendingBodyTruncated: tlbe.NewUint256(big.NewInt(0)),
				},
			},
			RootMetadata: RootMetadata{
				ChainID:              big.NewInt(chainID),
				MultiSig:             tvm.ZeroAddress,
				PreOpCount:           0,
				PostOpCount:          0,
				OverridePreviousRoot: false,
			},
		},
	}
}
