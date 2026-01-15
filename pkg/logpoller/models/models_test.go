package models

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
)

func TestLog_Validate(t *testing.T) {
	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	tests := []struct {
		name            string
		log             Log
		expectedChainID string
		wantErr         bool
	}{
		{
			name: "valid log",
			log: Log{
				ChainID:      "test-chain",
				MCBlockSeqno: 100,
				Address:      testAddr,
			},
			expectedChainID: "test-chain",
			wantErr:         false,
		},
		{
			name: "invalid chainID",
			log: Log{
				ChainID:      "wrong-chain",
				MCBlockSeqno: 100,
				Address:      testAddr,
			},
			expectedChainID: "test-chain",
			wantErr:         true,
		},
		{
			name: "zero MCBlockSeqno is allowed",
			log: Log{
				ChainID:      "test-chain",
				MCBlockSeqno: 0,
				Address:      testAddr,
			},
			expectedChainID: "test-chain",
			wantErr:         false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.log.Validate(tt.expectedChainID)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
