package burnmint

import (
	"reflect"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/pkg/test/ton/tvmtest"
)

// TestBurnMintMessageOpcodes verifies every registered message opcode matches
// crc32 of its Tolk struct name (BurnMintTokenPool_<GoTypeName>).
func TestBurnMintMessageOpcodes(t *testing.T) {
	tvmtest.CheckOpcodes(t, TLBs, tvmtest.OpcodeSpec{
		Prefix:  "BurnMintTokenPool_",
		Package: reflect.TypeFor[Storage]().PkgPath(),
		Skip: map[string]bool{
			// Standard jetton opcode 0xd53276db; `nolint:opcode` on-chain, so it
			// intentionally deviates from crc32("ReturnExcessesBack").
			"ReturnExcessesBack": true,
		},
	})
}
