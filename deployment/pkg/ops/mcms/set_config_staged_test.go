package mcms

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/mcms/sdk"
	mcmstypes "github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
)

func TestBuildStagedConfigMessages(t *testing.T) {
	dst := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c")
	cfg := stagedTestConfig(t, 69, 21)

	messages, err := buildStagedConfigMessages(dst, tlb.MustFromTON("0.5"), cfg, false, true)
	require.NoError(t, err)
	require.Len(t, messages, 5) // begin + 32 + 32 + 5 + commit

	require.Equal(t, uint32(0xeaaf141c), mustOpcode(t, messages[0]))
	require.Equal(t, uint32(0x2847bdb3), mustOpcode(t, messages[1]))
	require.Equal(t, uint32(0x2847bdb3), mustOpcode(t, messages[2]))
	require.Equal(t, uint32(0x2847bdb3), mustOpcode(t, messages[3]))
	require.Equal(t, uint32(0x7a475aac), mustOpcode(t, messages[4]))

	var begin mcms.BeginConfigStaging
	require.NoError(t, tlb.LoadFromCell(&begin, messages[0].Body.Cell.MustBeginParse()))
	queryID := begin.QueryID

	_, _, expectedAddresses, expectedGroups, err := sdk.ExtractSetConfigInputs(cfg)
	require.NoError(t, err)
	signerIndex := 0
	expectedOffsets := []uint16{0, StageConfigChunkSize, 2 * StageConfigChunkSize}
	for i, index := range []int{1, 2, 3} {
		var stage mcms.StageConfig
		require.NoError(t, tlb.LoadFromCell(&stage, messages[index].Body.Cell.MustBeginParse()))
		require.Equal(t, queryID, stage.QueryID)
		require.Equal(t, expectedOffsets[i], stage.ExpectedNumSigners)
		for i := range stage.SignerAddresses {
			require.Equal(t, expectedAddresses[signerIndex].Big(), stage.SignerAddresses[i].Val.Value())
			require.Equal(t, expectedGroups[signerIndex], stage.SignerGroups[i].Val)
			signerIndex++
		}
	}
	require.Equal(t, len(expectedAddresses), signerIndex)

	var commit mcms.CommitConfig
	require.NoError(t, tlb.LoadFromCell(&commit, messages[4].Body.Cell.MustBeginParse()))
	require.Equal(t, queryID, commit.QueryID)
	require.Equal(t, uint16(69), commit.ExpectedNumSigners)
	require.False(t, commit.ClearRoot)
}

func TestBuildStagedConfigMessagesMaxSize(t *testing.T) {
	dst := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c")
	cfg := stagedTestConfig(t, MaxStagedConfigSigners, 31)

	messages, err := buildStagedConfigMessages(dst, tlb.MustFromTON("0.5"), cfg, false, true)
	require.NoError(t, err)
	require.Len(t, messages, 9) // begin + 7 chunks + commit

	var lastStage mcms.StageConfig
	require.NoError(t, tlb.LoadFromCell(&lastStage, messages[7].Body.Cell.MustBeginParse()))
	require.Equal(t, uint16(192), lastStage.ExpectedNumSigners)
	var commit mcms.CommitConfig
	require.NoError(t, tlb.LoadFromCell(&commit, messages[8].Body.Cell.MustBeginParse()))
	require.Equal(t, uint16(200), commit.ExpectedNumSigners)
}

func mustOpcode(t *testing.T, msg opston.InternalMessage[any]) uint32 {
	t.Helper()
	body, err := msg.ToMessage()
	require.NoError(t, err)
	opcode, err := tvm.ExtractOpcode(body.Body)
	require.NoError(t, err)
	return opcode
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
