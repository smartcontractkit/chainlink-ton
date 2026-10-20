package router

import (
	"reflect"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/pkg/test/ton/tvmtest"
)

func TestRouterMessageOpcodes(t *testing.T) {
	tvmtest.CheckOpcodes(t, TLBs, tvmtest.OpcodeSpec{
		Prefix:  "Router_",
		Package: reflect.TypeOf(Storage{}).PkgPath(),
	})
}
