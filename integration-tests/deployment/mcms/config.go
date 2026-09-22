package mcms

import (
	"github.com/ethereum/go-ethereum/common"
	mcmstypes "github.com/smartcontractkit/mcms/types"
)

var TestMCMSConfig1 = mcmstypes.Config{
	Quorum: 1,
	Signers: []common.Address{
		common.HexToAddress("0x0000000000000000000000000000000000000001"),
	},
	GroupSigners: []mcmstypes.Config{},
}

var TestMCMSConfig2 = mcmstypes.Config{
	Quorum: 2,
	Signers: []common.Address{
		common.HexToAddress("0x0000000000000000000000000000000000000031"),
		common.HexToAddress("0x0000000000000000000000000000000000000032"),
	},
	GroupSigners: []mcmstypes.Config{},
}
