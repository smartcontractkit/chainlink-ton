package loader

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateTransactionListResponse(t *testing.T) {
	t.Run("accepts valid response within limit", func(t *testing.T) {
		err := validateTransactionListResponse(10, 10, 100)
		require.NoError(t, err)
	})

	t.Run("accepts response at exact limit", func(t *testing.T) {
		err := validateTransactionListResponse(100, 100, 100)
		require.NoError(t, err)
	})

	t.Run("rejects response exceeding limit", func(t *testing.T) {
		err := validateTransactionListResponse(101, 101, 100)
		require.Error(t, err)
	})

	t.Run("rejects mismatched IDs count (fewer IDs)", func(t *testing.T) {
		err := validateTransactionListResponse(10, 5, 100)
		require.Error(t, err)
	})

	t.Run("rejects mismatched IDs count (more IDs)", func(t *testing.T) {
		err := validateTransactionListResponse(5, 10, 100)
		require.Error(t, err)
	})
}
