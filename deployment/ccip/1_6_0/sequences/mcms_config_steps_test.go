package sequences

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Masterminds/semver/v3"
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

func TestNeedsStagedConfig(t *testing.T) {
	tests := []struct {
		name           string
		version        *semver.Version
		currentSigners int
		currentGroups  int
		final          mcmstypes.Config
		want           bool
	}{
		{
			name:           "0.0.4 stays on intermediate workaround",
			version:        semver.MustParse("0.0.4"),
			currentSigners: 16,
			currentGroups:  8,
			final:          testConfig(t, 69, 21),
			want:           false,
		},
		{
			name:           "0.0.5 small config stays direct",
			version:        semver.MustParse("0.0.5"),
			currentSigners: 31,
			currentGroups:  8,
			final:          testConfig(t, 52, 21),
			want:           false,
		},
		{
			name:           "0.0.5 large final uses staging",
			version:        semver.MustParse("0.0.5"),
			currentSigners: 16,
			currentGroups:  8,
			final:          testConfig(t, 69, 21),
			want:           true,
		},
		{
			name:           "0.0.5 large current uses staging",
			version:        semver.MustParse("0.0.5"),
			currentSigners: 69,
			currentGroups:  21,
			final:          testConfig(t, 42, 3),
			want:           true,
		},
		{
			name:           "unknown version stays direct",
			version:        nil,
			currentSigners: 16,
			currentGroups:  8,
			final:          testConfig(t, 69, 21),
			want:           false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, needsStagedConfig(tt.version, tt.currentSigners, tt.currentGroups, tt.final))
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

	groups := make([]map[string]any, groupCount)
	for i := 0; i < signerCount; i++ {
		group := i % groupCount
		signers, _ := groups[group]["signers"].([]string)
		groups[group] = map[string]any{
			"quorum":  1,
			"signers": append(signers, fmt.Sprintf("0x%040x", i+1)),
		}
	}

	raw, err := json.Marshal(map[string]any{
		"quorum":       2,
		"groupSigners": groups,
	})
	require.NoError(t, err)

	var cfg mcmstypes.Config
	require.NoError(t, json.Unmarshal(raw, &cfg))
	require.NoError(t, cfg.Validate())
	return cfg
}
