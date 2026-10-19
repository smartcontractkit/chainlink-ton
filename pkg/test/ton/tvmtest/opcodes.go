// Package tvmtest provides reusable assertions for TON Go bindings.
package tvmtest

import (
	"reflect"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/hash"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

// OpcodeSpec configures CheckOpcodes.
type OpcodeSpec struct {
	// Prefix is prepended to the Go type name to form the on-chain Tolk struct
	// name, e.g. "TokenPool_" -> "TokenPool_SetDeployableCode".
	Prefix string

	// Package restricts validation to types declared in this Go package path.
	// Types from other packages (shared libs, aliases) are skipped and covered
	// by their own package's test.
	Package string

	// TolkNames overrides the derived Tolk struct name for Go types whose Tolk
	// name does not follow the Prefix+GoName convention.
	TolkNames map[string]string

	// Skip lists Go types whose on-chain opcode intentionally deviates from
	// crc32(name) (see `nolint:opcode` in Tolk). crc32 cannot validate these.
	Skip map[string]bool
}

// CheckOpcodes verifies that every opcode registered in a contract's TLBMap
// equals crc32 of the corresponding Tolk struct name.
func CheckOpcodes(t *testing.T, tlbs tvm.TLBMap, spec OpcodeSpec) {
	t.Helper()

	for magic, v := range tlbs {
		if magic == tvm.TLBMapKeyStorage {
			continue
		}
		rt := reflect.TypeOf(v)
		if rt == nil || rt.Kind() != reflect.Struct {
			continue
		}
		if spec.Package != "" && rt.PkgPath() != spec.Package {
			continue
		}

		name := goTypeName(rt)
		if spec.Skip[name] {
			continue
		}
		tolkName := spec.Prefix + name
		if override, ok := spec.TolkNames[name]; ok {
			tolkName = override
		}

		t.Run(name, func(t *testing.T) {
			want := uint64(hash.CRC32(tolkName))
			require.Equal(t, want, magic,
				"opcode mismatch for %s: TLBMap has 0x%08X, crc32(%s) is 0x%08X",
				name, magic, tolkName, want)
		})
	}
}

// goTypeName returns the bare type name, stripping any generic instantiation
// suffix (e.g. "RMNAccessControlMessage[interface {}]" -> "RMNAccessControlMessage").
func goTypeName(rt reflect.Type) string {
	name := rt.Name()
	if i := strings.IndexByte(name, '['); i >= 0 {
		name = name[:i]
	}
	return name
}
