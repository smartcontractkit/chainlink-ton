package mcms

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
)

func TestBuildStagedConfigMessages(t *testing.T) {
	var groupQuorums [32]uint8
	var groupParents [32]uint8
	groupQuorums[0] = 1
	groupQuorums[1] = 1

	addresses := make([]SignerAddress, 69)
	groups := make([]SignerGroup, 69)
	for i := range addresses {
		addresses[i] = SignerAddress{Val: tlbe.NewUint160(big.NewInt(int64(i + 1)))}
		groups[i] = SignerGroup{Val: 1}
	}

	messages, err := BuildStagedConfigMessages(groupQuorums, groupParents, addresses, groups, 42, false, 32)
	require.NoError(t, err)
	require.Equal(t, uint64(42), messages.Begin.QueryID)
	require.Len(t, messages.Stages, 3)
	require.Equal(t, uint16(0), messages.Stages[0].ExpectedNumSigners)
	require.Len(t, messages.Stages[0].SignerAddresses, 32)
	require.Equal(t, uint16(32), messages.Stages[1].ExpectedNumSigners)
	require.Len(t, messages.Stages[1].SignerAddresses, 32)
	require.Equal(t, uint16(64), messages.Stages[2].ExpectedNumSigners)
	require.Len(t, messages.Stages[2].SignerAddresses, 5)
	require.Equal(t, uint16(69), messages.Commit.ExpectedNumSigners)
}

func TestBuildStagedConfigMessagesRejectsInvalidInputs(t *testing.T) {
	var groupQuorums [32]uint8
	var groupParents [32]uint8

	makeSigners := func(count int) ([]SignerAddress, []SignerGroup) {
		addresses := make([]SignerAddress, count)
		groups := make([]SignerGroup, count)
		for i := range addresses {
			addresses[i] = SignerAddress{Val: tlbe.NewUint160(big.NewInt(int64(i + 1)))}
			groups[i] = SignerGroup{Val: 1}
		}
		return addresses, groups
	}

	_, oneGroup := makeSigners(1)
	twoAddresses, twoGroups := makeSigners(2)
	tooManyAddresses, tooManyGroups := makeSigners(MaxNumSigners + 1)

	tests := []struct {
		name      string
		addresses []SignerAddress
		groups    []SignerGroup
		chunkSize int
		wantErr   string
	}{
		{
			name:      "no signers",
			chunkSize: MaxSignersPerStage,
			wantErr:   "at least one signer",
		},
		{
			name:      "too many signers",
			addresses: tooManyAddresses,
			groups:    tooManyGroups,
			chunkSize: MaxSignersPerStage,
			wantErr:   "maximum is 200",
		},
		{
			name:      "mismatched groups",
			addresses: twoAddresses,
			groups:    oneGroup,
			chunkSize: MaxSignersPerStage,
			wantErr:   "length mismatch",
		},
		{
			name:      "chunk too large",
			addresses: twoAddresses,
			groups:    twoGroups,
			chunkSize: MaxSignersPerStage + 1,
			wantErr:   "exceeds maximum 32",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := BuildStagedConfigMessages(groupQuorums, groupParents, tt.addresses, tt.groups, 42, false, tt.chunkSize)
			require.ErrorContains(t, err, tt.wantErr)
		})
	}
}
