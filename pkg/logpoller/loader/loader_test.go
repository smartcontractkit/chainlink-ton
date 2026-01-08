package loader

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateTransactionListResponse(t *testing.T) {
	tests := []struct {
		name      string
		txCount   int
		idsCount  int
		limit     uint32
		expectErr bool
	}{
		{"valid response within limit", 10, 10, 100, false},
		{"response at exact limit", 100, 100, 100, false},
		{"response exceeding limit", 101, 101, 100, true},
		{"mismatched IDs count (fewer)", 10, 5, 100, true},
		{"mismatched IDs count (more)", 5, 10, 100, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateTransactionListResponse(tt.txCount, tt.idsCount, tt.limit)
			if tt.expectErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
