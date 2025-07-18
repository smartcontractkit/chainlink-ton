package hash

import "testing"

func TestCalculateSchemaCRC32(t *testing.T) {
	testCases := []struct {
		name           string
		inputSchema    string
		expectedOpcode uint32
	}{
		{
			name:           "CounterIncreased",
			inputSchema:    "CounterIncreased",
			expectedOpcode: 0x0e5f2827,
		},
		{
			name:           "CounterReset",
			inputSchema:    "CounterReset",
			expectedOpcode: 0x9bc5e2cd,
		},
		{
			name:           "CCIPMessageSent",
			inputSchema:    "CCIPMessageSent",
			expectedOpcode: 0xa45d293c,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			actualOpcode := CalcCRC32(tc.inputSchema)

			if actualOpcode != tc.expectedOpcode {
				t.Errorf("for input '%s', expected opcode 0x%x, but got 0x%x",
					tc.inputSchema, tc.expectedOpcode, actualOpcode)
			}
		})
	}
}
