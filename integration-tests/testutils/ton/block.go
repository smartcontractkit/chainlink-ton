package ton

import (
	tonSDK "github.com/xssnick/tonutils-go/ton"
)

// TestBlockIDExt creates a valid BlockIDExt for testing with required hash fields.
func TestBlockIDExt(seqNo uint32) *tonSDK.BlockIDExt {
	return &tonSDK.BlockIDExt{
		Workchain: 0,
		Shard:     -1,
		SeqNo:     seqNo,
		RootHash:  make([]byte, 32),
		FileHash:  make([]byte, 32),
	}
}
