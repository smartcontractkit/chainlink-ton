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
	targetAll := TargetAll
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
				Target: targetAll,
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var opInput struct {
				Inputs []FundContractsInput `yaml:"inputs"`
			}
			err := yaml.Unmarshal([]byte(tc.input), &opInput)
			require.NoError(t, err, "failed to unmarshal input: %v", err)
			require.Len(t, opInput.Inputs, 1, "expected exactly 1 input")

			actual := opInput.Inputs[0]
			parsed, err := parseFundContractsInput(actual)
			require.NoError(t, err, "failed to parse fund contracts input")
			require.Equalf(t, parsed.Mode, tc.expected.Mode, "expected mode %s, got %s", tc.expected.Mode, parsed.Mode)
			require.Truef(t, parsed.Amount.Equals(&tc.expected.Amount), "expected amount %s, got %s", tc.expected.Amount.String(), parsed.Amount.String())
			require.Equalf(t, parsed.Target, tc.expected.Target, "expected target %s, got %v", tc.expected.Target, parsed.Target)
		})
	}
}
