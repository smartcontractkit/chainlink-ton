package mcms

import (
	"fmt"
	"strings"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

func TestExitCodeCodecAndStringer(t *testing.T) {
	valid := []struct {
		code     int32
		wantName string
	}{
		{39000, "ErrorOutOfBoundsNumSigners"},
		{39001, "ErrorSignerGroupsLengthMismatch"},
		{39024, "ErrorUnauthorizedOracle"},
	}

	for _, tt := range valid {
		v, err := ExitCodeCodec.NewFrom(tvm.ExitCode(tt.code))
		if err != nil {
			t.Fatalf("NewFrom(%d) returned error: %v", tt.code, err)
		}
		s := fmt.Sprint(v)
		if !strings.Contains(s, tt.wantName) {
			t.Fatalf("String(%d) = %q; want it to contain %q", tt.code, s, tt.wantName)
		}
	}

	// Out-of-range codes must return an error
	invalid := []int32{38999, 40000, 12345}
	for _, c := range invalid {
		_, err := ExitCodeCodec.NewFrom(tvm.ExitCode(c))
		if err == nil {
			t.Fatalf("expected error for out-of-range code %d, got nil", c)
		}
	}
}
