package models

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

func TestValidateBlockIDExt(t *testing.T) {
	tests := []struct {
		name    string
		block   *ton.BlockIDExt
		wantErr string
	}{
		{
			name:    "nil block",
			block:   nil,
			wantErr: "block is nil",
		},
		{
			name: "valid block",
			block: &ton.BlockIDExt{
				Workchain: 0,
				Shard:     -1,
				SeqNo:     100,
				RootHash:  make([]byte, 32),
				FileHash:  make([]byte, 32),
			},
			wantErr: "",
		},
		{
			name: "empty RootHash",
			block: &ton.BlockIDExt{
				Workchain: 0,
				Shard:     -1,
				SeqNo:     100,
				RootHash:  nil,
				FileHash:  make([]byte, 32),
			},
			wantErr: "invalid RootHash length: expected 32 bytes, got 0",
		},
		{
			name: "empty FileHash",
			block: &ton.BlockIDExt{
				Workchain: 0,
				Shard:     -1,
				SeqNo:     100,
				RootHash:  make([]byte, 32),
				FileHash:  nil,
			},
			wantErr: "invalid FileHash length: expected 32 bytes, got 0",
		},
		{
			name: "short RootHash",
			block: &ton.BlockIDExt{
				Workchain: 0,
				Shard:     -1,
				SeqNo:     100,
				RootHash:  make([]byte, 16),
				FileHash:  make([]byte, 32),
			},
			wantErr: "invalid RootHash length: expected 32 bytes, got 16",
		},
		{
			name: "long FileHash",
			block: &ton.BlockIDExt{
				Workchain: 0,
				Shard:     -1,
				SeqNo:     100,
				RootHash:  make([]byte, 32),
				FileHash:  make([]byte, 64),
			},
			wantErr: "invalid FileHash length: expected 32 bytes, got 64",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateBlockIDExt(tt.block)
			if tt.wantErr == "" {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
				require.Contains(t, err.Error(), tt.wantErr)
			}
		})
	}
}

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
