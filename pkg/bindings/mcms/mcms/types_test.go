package mcms

import (
	"fmt"
	"math/big"
	"strings"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

func TestStagedConfigSignerLookupByValue(t *testing.T) {
	key := tlbe.NewUint160(big.NewInt(1))
	equalKey := tlbe.NewUint160(big.NewInt(1))

	staged := StagedConfig{
		Signers: tlbe.NewDict(map[tlbe.Uint160]Signer{
			*key: {Address: key, Index: 7, Group: 3},
		}),
	}

	signer, ok := staged.Signers.Get(*equalKey)
	if !ok {
		t.Fatal("expected signer lookup to succeed for an equal key value")
	}
	if signer.Index != 7 || signer.Group != 3 {
		t.Fatalf("unexpected signer: %+v", signer)
	}
}

func TestExitCodeCodecAndStringer(t *testing.T) {
	valid := []struct {
		code     int32
		wantName string
	}{
		{10400, "ErrorOutOfBoundsNumSigners"},
		{10401, "ErrorSignerGroupsLengthMismatch"},
		{10426, "InsufficientFee"},
		{10427, "ErrorConfigStagingNotStarted"},
		{10430, "ErrorConfigStagingSessionMismatch"},
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
	invalid := []int32{10431, 10432, 12345}
	for _, c := range invalid {
		_, err := ExitCodeCodec.NewFrom(tvm.ExitCode(c))
		if err == nil {
			t.Fatalf("expected error for out-of-range code %d, got nil", c)
		}
	}
}
