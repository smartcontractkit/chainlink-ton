package tokenpool

import (
	"reflect"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/pkg/test/ton/tvmtest"
)

func TestTokenPoolMessageOpcodes(t *testing.T) {
	tvmtest.CheckOpcodes(t, TLBs, tvmtest.OpcodeSpec{
		Prefix:  "TokenPool_",
		Package: reflect.TypeOf(Storage{}).PkgPath(),
	})
}
