package ton

import (
	"testing"

	"github.com/stretchr/testify/assert/yaml"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestUnmarshalInput(t *testing.T) {
	type testCase struct {
		name     string
		input    string
		expected parsedFundContractsInput
	}
	cases := []testCase{
		{
			name: "basic input",
			input: `
inputs:
  -
    mode: "TopUp"
    amount: "10"
    target: "All"
`,
			expected: parsedFundContractsInput{
				Mode:   FundModeTopUp,
				Amount: tlb.MustFromTON("10"),
				Target: TargetAll,
			},
		},
		{
			name: "defaults",
			input: `
inputs:
  -
    amount: "10"
`,
			expected: parsedFundContractsInput{
				Mode:   FundModeTopUp,
				Amount: tlb.MustFromTON("10"),
				Target: TargetAll,
			},
		},
		{
			name: "decimal amount",
			input: `
inputs:
  -
    amount: "10.5"
`,
			expected: parsedFundContractsInput{
				Mode:   FundModeTopUp,
				Amount: tlb.MustFromTON("10.5"),
				Target: TargetAll,
			},
		},
		{
			name: "ExactAmount mode",
			input: `
inputs:
  -
    mode: "ExactAmount"
    amount: "10"
`,
			expected: parsedFundContractsInput{
				Mode:   FundModeExactAmount,
				Amount: tlb.MustFromTON("10"),
				Target: TargetAll,
			},
		},

		{
			name: "CCIP target",
			input: `
inputs:
  -
    amount: "10"
	target: "CCIP"
`,
			expected: parsedFundContractsInput{
				Mode:   FundModeTopUp,
				Amount: tlb.MustFromTON("10"),
				Target: TargetCCIP,
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var opInput struct {
				Inputs []FundContractsInput `yaml:"inputs"`
			}
			err := yaml.Unmarshal([]byte(tc.input), &opInput)
			require.NoErrorf(t, err, "case: %s failed to unmarshal input: %v", tc.name, err)
			require.Len(t, opInput.Inputs, 1, "expected exactly 1 input")

			actual := opInput.Inputs[0]
			parsed, err := parseFundContractsInput(actual)
			require.NoErrorf(t, err, "case: %s failed to parse fund contracts input", tc.name)
			require.Equalf(t, parsed.Mode, tc.expected.Mode, "case: %s expected mode %s, got %s", tc.name, tc.expected.Mode, parsed.Mode)
			require.Truef(t, parsed.Amount.Equals(&tc.expected.Amount), "case: %s expected amount %s, got %s", tc.name, tc.expected.Amount.String(), parsed.Amount.String())
			require.Equalf(t, parsed.Target, tc.expected.Target, "case: %s expected target %s, got %v", tc.name, tc.expected.Target, parsed.Target)
		})
	}
}
