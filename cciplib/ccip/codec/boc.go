package codec

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
)

// fromBOC parses a BOC and converts parser panics into decode errors. The pinned
// tonutils-go (v1.14.1) reads the BOC header unchecked and indexes the first root
// without validating that one exists, so framing-malformed bytes panic instead of
// erroring. These decoders take bytes crossing a trust boundary (peer reports,
// on-chain events) and should avoid panics by converting them into errors.
//
// The root must also be an ordinary cell: every decoder here reads it with a
// schema-aware loader rather than TVM's CTOS, so a special root would have its
// descriptor read as payload.
//
// TODO(tonutils-upgrade): remove the recover once tonutils-go >= v1.17.0, whose
// parser rewrite returns errors for these shapes.
func fromBOC(data []byte) (c *cell.Cell, err error) {
	defer func() {
		if r := recover(); r != nil {
			c, err = nil, fmt.Errorf("BOC parse panicked: %v", r)
		}
	}()

	c, err = cell.FromBOC(data)
	if err != nil {
		return nil, err
	}
	if err := common.CheckOrdinaryTree(c); err != nil {
		return nil, fmt.Errorf("invalid BOC: %w", err)
	}
	return c, nil
}
