package mcms

import (
	"fmt"
	"strings"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

func TestExitCodeCodecAndStringer(t *testing.T) {
	valid := []struct {
		code     int32
		wantName string
	}{
		{10400, "ErrorOutOfBoundsNumSigners"},
		{10401, "ErrorSignerGroupsLengthMismatch"},
		{10426, "InsufficientFee"},
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
	invalid := []int32{10427, 10428, 12345}
	for _, c := range invalid {
		_, err := ExitCodeCodec.NewFrom(tvm.ExitCode(c))
		if err == nil {
			t.Fatalf("expected error for out-of-range code %d, got nil", c)
		}
	}
}
