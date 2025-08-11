package types

import "github.com/xssnick/tonutils-go/ton"

type TxHash [32]byte

// BlockRange represents a range of blocks to process
type BlockRange struct {
	Prev *ton.BlockIDExt // previous block (nil for genesis)
	To   *ton.BlockIDExt // target block to process up to
}
