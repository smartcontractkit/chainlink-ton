package ton

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"gopkg.in/yaml.v3"
)

func TestUnmarshalInput(t *testing.T) {
	type expectedResolver struct {
		Type       TargetProtocol
		Qualifiers []string // nil means all qualifiers for MCMS
	}

	type testCase struct {
		name            string
		input           string
		expectedMode    FundMode
		expectedAmount  tlb.Coins
		expectedTargets []expectedResolver
		shouldError     bool
	}
	cases := []testCase{
		{
			name: "defaults - no targets specified",
			input: `
inputs:
  -
    amount: "10"
`,
			expectedMode:   FundModeTopUp,
			expectedAmount: tlb.MustFromTON("10"),
			expectedTargets: []expectedResolver{
				{Type: TargetProtocolCCIP},
				{Type: TargetProtocolMCMS, Qualifiers: nil},
			},
		},
		{
			name: "decimal amount",
			input: `
inputs:
  -
    amount: "10.5"
`,
			expectedMode:   FundModeTopUp,
			expectedAmount: tlb.MustFromTON("10.5"),
		},
		{
			name: "ExactAmount mode",
			input: `
inputs:
  -
    mode: "ExactAmount"
    amount: "10"
`,
			expectedMode:   FundModeExactAmount,
			expectedAmount: tlb.MustFromTON("10"),
		},
		{
			name: "CCIP target only",
			input: `
inputs:
  -
    amount: "10"
    targets:
      - CCIP
`,
			expectedMode:   FundModeTopUp,
			expectedAmount: tlb.MustFromTON("10"),
			expectedTargets: []expectedResolver{
				{Type: TargetProtocolCCIP},
			},
		},
		{
			name: "MCMS target all qualifiers",
			input: `
inputs:
  -
    amount: "10"
    targets:
      - MCMS
`,
			expectedMode:   FundModeTopUp,
			expectedAmount: tlb.MustFromTON("10"),
			expectedTargets: []expectedResolver{
				{Type: TargetProtocolMCMS, Qualifiers: nil},
			},
		},
		{
			name: "MCMS target with specific qualifier",
			input: `
inputs:
  -
    amount: "10"
    targets:
      - MCMS: [CLLCCIP]
`,
			expectedMode:   FundModeTopUp,
			expectedAmount: tlb.MustFromTON("10"),
			expectedTargets: []expectedResolver{
				{Type: TargetProtocolMCMS, Qualifiers: []string{"CLLCCIP"}},
			},
		},
		{
			name: "MCMS target with multiple qualifiers",
			input: `
inputs:
  -
    amount: "10"
    targets:
      - MCMS: [CLLCCIP, RMNMCMS]
`,
			expectedMode:   FundModeTopUp,
			expectedAmount: tlb.MustFromTON("10"),
			expectedTargets: []expectedResolver{
				{Type: TargetProtocolMCMS, Qualifiers: []string{"CLLCCIP", "RMNMCMS"}},
			},
		},
		{
			name: "MCMS target with multiple qualifiers as list items",
			input: `
inputs:
  -
    amount: "10"
    targets:
      - MCMS:
        - CLLCCIP
        - RMNMCMS
`,
			expectedMode:   FundModeTopUp,
			expectedAmount: tlb.MustFromTON("10"),
			expectedTargets: []expectedResolver{
				{Type: TargetProtocolMCMS, Qualifiers: []string{"CLLCCIP", "RMNMCMS"}},
			},
		},
		{
			name: "CCIP and MCMS with qualifiers",
			input: `
inputs:
  -
    amount: "10"
    targets:
      - CCIP
      - MCMS: [CLLCCIP]
`,
			expectedMode:   FundModeTopUp,
			expectedAmount: tlb.MustFromTON("10"),
			expectedTargets: []expectedResolver{
				{Type: TargetProtocolCCIP},
				{Type: TargetProtocolMCMS, Qualifiers: []string{"CLLCCIP"}},
			},
		},
		{
			name: "CCIP and all MCMS",
			input: `
inputs:
  -
    amount: "10"
    targets:
      - CCIP
      - MCMS
`,
			expectedMode:   FundModeTopUp,
			expectedAmount: tlb.MustFromTON("10"),
			expectedTargets: []expectedResolver{
				{Type: TargetProtocolCCIP},
				{Type: TargetProtocolMCMS, Qualifiers: nil},
			},
		},
		{
			name: "Invalid target string",
			input: `
inputs:
  -
    amount: "10"
    targets:
      - invalid
`,
			shouldError: true,
		},
		{
			name: "Empty MCMS qualifier",
			input: `
inputs:
  -
    amount: "10"
    targets:
      - MCMS: [""]
`,
			shouldError: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var opInput struct {
				Inputs []FundContractsInput `yaml:"inputs"`
			}
			err := yaml.Unmarshal([]byte(tc.input), &opInput)
			require.NoError(t, err, "failed to unmarshal input")
			require.Len(t, opInput.Inputs, 1, "expected exactly 1 input")

			actual := opInput.Inputs[0]
			parsed, err := parseFundContractsInput(actual)

			if tc.shouldError {
				require.Error(t, err, "expected parsing to fail")
				return
			}

			require.NoError(t, err, "failed to parse fund contracts input")
			require.Equal(t, tc.expectedMode, parsed.Mode, "mode mismatch")
			require.True(t, parsed.Amount.Equals(&tc.expectedAmount), "expected amount %s, got %s", tc.expectedAmount.String(), parsed.Amount.String())

			// Verify targets using declarative expectedTargets
			if len(tc.expectedTargets) > 0 {
				require.Len(t, parsed.Targets.Protocols, len(tc.expectedTargets), "resolver count mismatch")

				for i, expected := range tc.expectedTargets {
					switch expected.Type {
					case TargetProtocolCCIP:
						_, ok := parsed.Targets.Protocols[i].(CCIPTarget)
						require.True(t, ok, "expected resolver %d to be CCIPTarget", i)
					case TargetProtocolMCMS:
						mcmsTarget, ok := parsed.Targets.Protocols[i].(MCMSTarget)
						require.True(t, ok, "expected resolver %d to be MCMSTarget", i)
						require.Equal(t, expected.Qualifiers, mcmsTarget.Qualifiers, "MCMS qualifiers mismatch at resolver %d", i)
					}
				}
			}
		})
	}
}
