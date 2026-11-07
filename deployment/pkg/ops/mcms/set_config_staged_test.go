package mcms

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	mcmstypes "github.com/smartcontractkit/mcms/types"
)

func TestBuildStagedConfigPlans(t *testing.T) {
	dst := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c")
	cfg := stagedTestConfig(t, 69, 21)

	plans, err := buildStagedConfigPlans(dst, tlb.MustFromTON("0.5"), cfg, false, true)
	require.NoError(t, err)
	require.Len(t, plans, 5) // begin + 32 + 32 + 5 + commit

	require.Equal(t, uint32(0xeaaf141c), plans[0].Opcode)
	require.Equal(t, uint32(0x2847bdb3), plans[1].Opcode)
	require.Equal(t, uint32(0x2847bdb3), plans[2].Opcode)
	require.Equal(t, uint32(0x2847bdb3), plans[3].Opcode)
	require.Equal(t, uint32(0x7a475aac), plans[4].Opcode)

	var begin mcms.BeginConfigStaging
	beginMsg, err := plans[0].Cell.ToValue()
	require.NoError(t, err)
	require.NoError(t, tlb.LoadFromCell(&begin, beginMsg.Body.MustBeginParse()))
	queryID := begin.QueryID

	for _, index := range []int{1, 2, 3} {
		var stage mcms.StageConfig
		msg, err := plans[index].Cell.ToValue()
		require.NoError(t, err)
		require.NoError(t, tlb.LoadFromCell(&stage, msg.Body.MustBeginParse()))
		require.Equal(t, queryID, stage.QueryID)
		require.Equal(t, uint16((index-1)*StageConfigChunkSize), stage.ExpectedNumSigners)
	}

	var commit mcms.CommitConfig
	commitMsg, err := plans[4].Cell.ToValue()
	require.NoError(t, err)
	require.NoError(t, tlb.LoadFromCell(&commit, commitMsg.Body.MustBeginParse()))
	require.Equal(t, queryID, commit.QueryID)
	require.Equal(t, uint16(69), commit.ExpectedNumSigners)
}

func TestBuildStagedConfigPlansMaxSize(t *testing.T) {
	dst := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c")
	cfg := stagedTestConfig(t, MaxStagedConfigSigners, 31)

	plans, err := buildStagedConfigPlans(dst, tlb.MustFromTON("0.5"), cfg, false, true)
	require.NoError(t, err)
	require.Len(t, plans, 9) // begin + 7 chunks + commit
}

func stagedTestConfig(t *testing.T, signerCount, groupCount int) *mcmstypes.Config {
	t.Helper()
	groups := make([]mcmstypes.Config, groupCount)
	for i := 0; i < signerCount; i++ {
		group := i % groupCount
		groups[group].Quorum = 1
		groups[group].Signers = append(groups[group].Signers, common.BigToAddress(big.NewInt(int64(i+1))))
	}
	cfg, err := mcmstypes.NewConfig(1, nil, groups)
	require.NoError(t, err)
	return &cfg
}
