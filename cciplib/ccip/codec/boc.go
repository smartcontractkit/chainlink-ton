package codec

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
)

// fromBOC parses a BOC whose cells must all be ordinary. These decoders take
// bytes crossing a trust boundary (peer reports, on-chain events), and every
// decoder here reads cells with a schema-aware loader rather than TVM's CTOS, so
// a special cell anywhere in the tree would have its descriptor read as payload.
//
// Framing-malformed bytes (truncated header, zero roots) are rejected by
// cell.FromBOC itself
func fromBOC(data []byte) (*cell.Cell, error) {
	c, err := cell.FromBOC(data)
	if err != nil {
		return nil, err
	}
	if err := common.CheckOrdinaryTree(c); err != nil {
		return nil, fmt.Errorf("invalid BOC: %w", err)
	}
	return c, nil
}
