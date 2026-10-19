package lockreleaselockbox

import (
	"reflect"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/pkg/test/ton/tvmtest"
)

// TestLockReleaseLockboxMessageOpcodes verifies every registered message opcode
// matches crc32 of its Tolk struct name (LockReleaseLockboxTokenPool_<GoTypeName>).
func TestLockReleaseLockboxMessageOpcodes(t *testing.T) {
	tvmtest.CheckOpcodes(t, TLBs, tvmtest.OpcodeSpec{
		Prefix:  "LockReleaseLockboxTokenPool_",
		Package: reflect.TypeOf(Storage{}).PkgPath(),
		Skip: map[string]bool{
			// Standard jetton opcode 0xd53276db; `nolint:opcode` on-chain, so it
			// intentionally deviates from crc32("ReturnExcessesBack").
			"ReturnExcessesBack": true,
		},
	})
}
