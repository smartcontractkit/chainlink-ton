package mcms

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

func EmptyDataFrom(id uint32, owner *address.Address, chainID int64) Data {
	return Data{
		ID: id,
		Ownable: ownable2step.Storage{
			Owner:        owner,
			PendingOwner: nil,
		},
		Oracle:  owner,
		Signers: tlbe.NewEmptyDict[*tlbe.Uint160, Signer](),
		Config: Config{
			Signers:      tlbe.NewEmptyDict[uint8, Signer](),
			GroupQuorums: tlbe.NewEmptyDict[uint8, uint8](),
			GroupParents: tlbe.NewEmptyDict[uint8, uint8](),
		},
		SeenSignedHashes: tlbe.NewEmptyDict[*tlbe.Uint256, bool](),
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
