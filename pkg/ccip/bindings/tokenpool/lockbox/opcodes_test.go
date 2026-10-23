package lockbox

import (
	"reflect"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/pkg/test/ton/tvmtest"
)

// TestLockBoxMessageOpcodes verifies every registered message opcode matches
// crc32 of its Tolk struct name (JettonLockBox_<GoTypeName>).
func TestLockBoxMessageOpcodes(t *testing.T) {
	tvmtest.CheckOpcodes(t, TLBs, tvmtest.OpcodeSpec{
		Prefix:  "JettonLockBox_",
		Package: reflect.TypeFor[Storage]().PkgPath(),
	})
}
