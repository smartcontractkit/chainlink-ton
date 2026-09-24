package offramp

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// addrSlice builds a *cell.Slice containing a serialized TON address,
// matching what the TVM stack returns for an `address` field.
func addrSlice(t *testing.T, addr *address.Address) *cell.Slice {
	t.Helper()
	b := cell.BeginCell()
	require.NoError(t, b.StoreAddr(addr))
	return b.EndCell().MustBeginParse()
}

// TestGetConfig_NewContract verifies the decoder correctly reads the 6-element
// stack returned by new OffRamp contracts:
//
//	[chainSelector, feeQuoter, threshold, tokenAdminRegistry, minGasLimit, minTTGasLimit]
func TestGetConfig_NewContract(t *testing.T) {
	feeQuoter, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	tokenAdminRegistry, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	const (
		chainSelector uint64 = 4294932324 // TON testnet
		threshold     uint32 = 300
	)

	minGasLimit := tlb.MustFromTON("0.025")
	minTTGasLimit := tlb.MustFromTON("0.2")

	// TVM stack is stored bottom-to-top, so the first-pushed element is at the
	// end of the slice. NewExecutionResult expects the slice in the order the
	// stack was popped (top first), which is the reverse of push order.
	// However, the getter methods (r.Int(0), r.Slice(1), ...) index into the
	// result slice directly, so index 0 = first returned value.
	// The tonutils-go RunGetMethod reverses the pop order so index 0 is the
	// deepest stack element (first returned). We replicate that here.
	result := ton.NewExecutionResult([]any{
		big.NewInt(int64(chainSelector)), // index 0: chainSelector
		addrSlice(t, feeQuoter),          // index 1: feeQuoter
		big.NewInt(int64(threshold)),     // index 2: permissionlessExecutionThresholdSeconds
		addrSlice(t, tokenAdminRegistry), // index 3: tokenAdminRegistry
		minGasLimit.Nano(),               // index 4: minGasLimit
		minTTGasLimit.Nano(),             // index 5: minTTGasLimit
	})

	cfg, err := GetConfig.Decoder.Decode(result)
	require.NoError(t, err)

	require.Equal(t, chainSelector, cfg.ChainSelector)
	require.True(t, cfg.FeeQuoterAddress.Equals(feeQuoter))
	require.Equal(t, threshold, cfg.PermissionlessExecutionThresholdSeconds)
	require.NotNil(t, cfg.TokenAdminRegistry)
	require.True(t, cfg.TokenAdminRegistry.Equals(tokenAdminRegistry))
	require.Equal(t, minGasLimit.Nano(), cfg.MinGasLimit.Nano())
	require.Equal(t, minTTGasLimit.Nano(), cfg.MinTTGasLimit.Nano())
}

// TestGetConfig_OldContract verifies the decoder correctly reads the 3-element
// stack returned by old (pre-1.7.0) OffRamp contracts:
//
//	[chainSelector, feeQuoter, threshold]
//
// tokenAdminRegistry is absent and must be left nil. This is the backwards-
// compatibility scenario that fixes the staging deployment error:
// "failed to get feeQuoter address slice: incorrect result type".
func TestGetConfig_OldContract(t *testing.T) {
	feeQuoter, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	const (
		chainSelector uint64 = 4294932324 // TON testnet
		threshold     uint32 = 300
	)

	result := ton.NewExecutionResult([]any{
		big.NewInt(int64(chainSelector)), // index 0: chainSelector
		addrSlice(t, feeQuoter),          // index 1: feeQuoter
		big.NewInt(int64(threshold)),     // index 2: permissionlessExecutionThresholdSeconds
		// NO index 3 — old contracts don't return tokenAdminRegistry
	})

	cfg, err := GetConfig.Decoder.Decode(result)
	require.NoError(t, err)

	require.Equal(t, chainSelector, cfg.ChainSelector)
	require.True(t, cfg.FeeQuoterAddress.Equals(feeQuoter))
	require.Equal(t, threshold, cfg.PermissionlessExecutionThresholdSeconds)
	require.Nil(t, cfg.TokenAdminRegistry, "old contracts must leave TokenAdminRegistry nil")
}
