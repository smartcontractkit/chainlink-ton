package sequences

import (
	"math/big"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/ethereum/go-ethereum/common"
	mcmstypes "github.com/smartcontractkit/mcms/types"
	"github.com/stretchr/testify/require"
)

func TestContractConfigSteps(t *testing.T) {
	intermediate := testConfig(t, 16, 8)
	adapter := NewTonDeployAdapter(&intermediate)

	tests := []struct {
		name            string
		contractVersion *semver.Version
		currentSigners  int
		currentGroups   int
		final           mcmstypes.Config
		wantSteps       int
	}{
		{
			name:            "small current and 69/21 final requires two steps",
			contractVersion: semver.MustParse("0.0.4"),
			currentSigners:  16,
			currentGroups:   8,
			final:           testConfig(t, 69, 21),
			wantSteps:       2,
		},
		{
			name:            "large current requires two steps even for small final",
			contractVersion: semver.MustParse("0.0.4"),
			currentSigners:  69,
			currentGroups:   21,
			final:           testConfig(t, 42, 3),
			wantSteps:       2,
		},
		{
			name:            "68/20 final requires two steps",
			contractVersion: semver.MustParse("0.0.4"),
			currentSigners:  32,
			currentGroups:   21,
			final:           testConfig(t, 68, 20),
			wantSteps:       2,
		},
		{
			name:            "60/21 current requires two steps",
			contractVersion: semver.MustParse("0.0.4"),
			currentSigners:  60,
			currentGroups:   21,
			final:           testConfig(t, 52, 21),
			wantSteps:       2,
		},
		{
			name:            "52/21 current and final stays single-step",
			contractVersion: semver.MustParse("0.0.4"),
			currentSigners:  52,
			currentGroups:   21,
			final:           testConfig(t, 52, 21),
			wantSteps:       1,
		},
		{
			name:            "31/21 current to 52/21 final stays single-step",
			contractVersion: semver.MustParse("0.0.4"),
			currentSigners:  31,
			currentGroups:   21,
			final:           testConfig(t, 52, 21),
			wantSteps:       1,
		},
		{
			name:            "31 groups requires two steps",
			contractVersion: semver.MustParse("0.0.4"),
			currentSigners:  16,
			currentGroups:   8,
			final:           testConfig(t, 56, 31),
			wantSteps:       2,
		},
		{
			name:            "0.0.5 uses the normal path",
			contractVersion: semver.MustParse("0.0.5"),
			currentSigners:  69,
			currentGroups:   21,
			final:           testConfig(t, 69, 21),
			wantSteps:       1,
		},
		{
			name:            "unknown version uses the normal path",
			contractVersion: nil,
			currentSigners:  69,
			currentGroups:   21,
			final:           testConfig(t, 69, 21),
			wantSteps:       1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			steps, err := adapter.configSteps(tt.contractVersion, tt.currentSigners, tt.currentGroups, tt.final)
			require.NoError(t, err)
			require.Len(t, steps, tt.wantSteps)

			if tt.wantSteps == 1 {
				require.True(t, steps[0].Equals(&tt.final))
				return
			}

			require.True(t, steps[0].Equals(&intermediate))
			require.True(t, steps[1].Equals(&tt.final))
		})
	}
}

func TestNeedsTwoStepCountsNestedGroups(t *testing.T) {
	nested := mcmstypes.Config{
		Quorum: 1,
		GroupSigners: []mcmstypes.Config{
			{Quorum: 1, GroupSigners: make([]mcmstypes.Config, 22)},
		},
	}
	require.True(t, needsTwoStep(1, 1, nested))
}

func TestConfigStepsRequiresIntermediateConfig(t *testing.T) {
	adapter := NewTonDeployAdapter(nil)
	_, err := adapter.configSteps(semver.MustParse("0.0.4"), 16, 8, testConfig(t, 69, 21))
	require.ErrorContains(t, err, "no intermediate config")
}

func TestConfigStepsRejectsSameIntermediateAndFinal(t *testing.T) {
	final := testConfig(t, 69, 21)
	adapter := NewTonDeployAdapter(&final)
	_, err := adapter.configSteps(semver.MustParse("0.0.4"), 16, 8, final)
	require.ErrorContains(t, err, "must differ")
}

func testConfig(t *testing.T, signerCount, groupCount int) mcmstypes.Config {
	t.Helper()

	groups := make([]mcmstypes.Config, groupCount)
	for i := 0; i < signerCount; i++ {
		group := i % groupCount
		groups[group].Quorum = 1
		groups[group].Signers = append(groups[group].Signers, common.BigToAddress(big.NewInt(int64(i+1))))
	}

	cfg, err := mcmstypes.NewConfig(2, nil, groups)
	require.NoError(t, err)
	return cfg
}
