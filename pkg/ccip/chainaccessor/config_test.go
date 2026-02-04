package chainaccessor

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	offrampview "github.com/smartcontractkit/chainlink-ton/pkg/ccip/view/offramp"
)

func bigIntFromHex(s string) *big.Int {
	bi, _ := new(big.Int).SetString(s, 16)
	return bi
}

// globalCurseSubjectHex is the hex representation of RMNREMOTE_GLOBAL_CURSE_SUBJECT
// from contracts/contracts/ccip/rmn_remote/lib.tolk
const globalCurseSubjectHex = "01000000000000000000000000000001"

func TestParseCurseInfo(t *testing.T) {
	destChainSelector := ccipocr3.ChainSelector(1234567890)

	t.Run("no curses - empty input", func(t *testing.T) {
		cursedSubjects := []*big.Int{}

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.False(t, result.GlobalCurse, "should not have global curse")
		assert.False(t, result.CursedDestination, "should not have destination curse")
		assert.Empty(t, result.CursedSourceChains, "should have no cursed source chains")
	})

	t.Run("no curses - nil input", func(t *testing.T) {
		var cursedSubjects []*big.Int

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.False(t, result.GlobalCurse, "should not have global curse")
		assert.False(t, result.CursedDestination, "should not have destination curse")
		assert.Empty(t, result.CursedSourceChains, "should have no cursed source chains")
	})

	t.Run("global curse only", func(t *testing.T) {
		globalCurse := bigIntFromHex(globalCurseSubjectHex)
		cursedSubjects := []*big.Int{globalCurse}

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.True(t, result.GlobalCurse, "should have global curse")
		assert.False(t, result.CursedDestination, "should not have destination curse")
		assert.Empty(t, result.CursedSourceChains, "global curse should not appear in source chains")
	})

	t.Run("destination chain cursed", func(t *testing.T) {
		destAsBigInt := new(big.Int).SetUint64(uint64(destChainSelector))
		cursedSubjects := []*big.Int{destAsBigInt}

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.False(t, result.GlobalCurse, "should not have global curse")
		assert.True(t, result.CursedDestination, "should have destination curse")
		assert.Empty(t, result.CursedSourceChains, "destination should not appear in source chains")
	})

	t.Run("single source chain cursed", func(t *testing.T) {
		sourceChain := big.NewInt(111111)
		cursedSubjects := []*big.Int{sourceChain}

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.False(t, result.GlobalCurse, "should not have global curse")
		assert.False(t, result.CursedDestination, "should not have destination curse")
		assert.Len(t, result.CursedSourceChains, 1, "should have 1 cursed source chain")
		assert.True(t, result.CursedSourceChains[ccipocr3.ChainSelector(111111)])
	})

	t.Run("multiple source chains cursed", func(t *testing.T) {
		sourceChain1 := big.NewInt(111111)
		sourceChain2 := big.NewInt(222222)
		sourceChain3 := big.NewInt(333333)
		cursedSubjects := []*big.Int{sourceChain1, sourceChain2, sourceChain3}

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.False(t, result.GlobalCurse, "should not have global curse")
		assert.False(t, result.CursedDestination, "should not have destination curse")
		assert.Len(t, result.CursedSourceChains, 3, "should have 3 cursed source chains")
		assert.True(t, result.CursedSourceChains[ccipocr3.ChainSelector(111111)])
		assert.True(t, result.CursedSourceChains[ccipocr3.ChainSelector(222222)])
		assert.True(t, result.CursedSourceChains[ccipocr3.ChainSelector(333333)])
	})

	t.Run("mixed curses - global, destination, and source chains", func(t *testing.T) {
		globalCurse := bigIntFromHex(globalCurseSubjectHex)
		destAsBigInt := new(big.Int).SetUint64(uint64(destChainSelector))
		sourceChain1 := big.NewInt(111111)
		sourceChain2 := big.NewInt(222222)

		cursedSubjects := []*big.Int{globalCurse, destAsBigInt, sourceChain1, sourceChain2}

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.True(t, result.GlobalCurse, "should have global curse")
		assert.True(t, result.CursedDestination, "should have destination curse")
		assert.Len(t, result.CursedSourceChains, 2, "should have 2 cursed source chains")
		assert.True(t, result.CursedSourceChains[ccipocr3.ChainSelector(111111)])
		assert.True(t, result.CursedSourceChains[ccipocr3.ChainSelector(222222)])
	})

	t.Run("global curse with source chains but not destination", func(t *testing.T) {
		globalCurse := bigIntFromHex(globalCurseSubjectHex)
		sourceChain := big.NewInt(999999)

		cursedSubjects := []*big.Int{globalCurse, sourceChain}

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.True(t, result.GlobalCurse, "should have global curse")
		assert.False(t, result.CursedDestination, "should not have destination curse")
		assert.Len(t, result.CursedSourceChains, 1, "should have 1 cursed source chain")
		assert.True(t, result.CursedSourceChains[ccipocr3.ChainSelector(999999)])
	})

	t.Run("large chain selector values (uint64 max)", func(t *testing.T) {
		// Use max uint64 value as chain selector
		maxUint64 := new(big.Int).SetUint64(^uint64(0))
		cursedSubjects := []*big.Int{maxUint64}

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.False(t, result.GlobalCurse)
		assert.False(t, result.CursedDestination)
		assert.Len(t, result.CursedSourceChains, 1)
		assert.True(t, result.CursedSourceChains[ccipocr3.ChainSelector(^uint64(0))])
	})

	t.Run("value larger than uint64 is ignored (except global curse)", func(t *testing.T) {
		// Value that doesn't fit in uint64 (but is not the global curse subject)
		largeValue := bigIntFromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF") // 128 bits all 1s
		sourceChain := big.NewInt(111111)

		cursedSubjects := []*big.Int{largeValue, sourceChain}

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.False(t, result.GlobalCurse, "should not have global curse (different value)")
		assert.False(t, result.CursedDestination)
		// largeValue should be ignored because it doesn't fit in uint64 and isn't the global curse
		assert.Len(t, result.CursedSourceChains, 1, "large value should be ignored")
		assert.True(t, result.CursedSourceChains[ccipocr3.ChainSelector(111111)])
	})

	t.Run("duplicate curse subjects are handled", func(t *testing.T) {
		sourceChain := big.NewInt(111111)
		// Same chain selector appears twice
		cursedSubjects := []*big.Int{sourceChain, sourceChain}

		result := parseCurseInfo(cursedSubjects, destChainSelector)

		assert.Len(t, result.CursedSourceChains, 1, "duplicates should result in single entry")
		assert.True(t, result.CursedSourceChains[ccipocr3.ChainSelector(111111)])
	})
}

func TestFilterSourceChainConfigs(t *testing.T) {
	testAddr := address.MustParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	makeConfig := func(minSeqNr uint64, isEnabled bool) offramp.SourceChainConfig {
		return offramp.SourceChainConfig{
			Router:                    testAddr,
			IsEnabled:                 isEnabled,
			MinSeqNr:                  minSeqNr,
			IsRMNVerificationDisabled: false,
			OnRamp:                    common.CrossChainAddress{1, 2, 3},
		}
	}

	t.Run("empty sourceChainSelectors returns all configs", func(t *testing.T) {
		sourceConfigsGot := offrampview.SourceChainConfigMap{
			1001: makeConfig(100, true),
			1002: makeConfig(200, true),
			1003: makeConfig(300, false),
		}

		result, err := filterSourceChainConfigs(sourceConfigsGot, []ccipocr3.ChainSelector{})
		require.NoError(t, err)

		assert.Len(t, result, 3, "should return all 3 configs")
		assert.Equal(t, uint64(100), result[ccipocr3.ChainSelector(1001)].MinSeqNr)
		assert.Equal(t, uint64(200), result[ccipocr3.ChainSelector(1002)].MinSeqNr)
		assert.Equal(t, uint64(300), result[ccipocr3.ChainSelector(1003)].MinSeqNr)
	})

	t.Run("nil sourceChainSelectors returns all configs", func(t *testing.T) {
		sourceConfigsGot := offrampview.SourceChainConfigMap{
			2001: makeConfig(500, true),
			2002: makeConfig(600, true),
		}

		result, err := filterSourceChainConfigs(sourceConfigsGot, nil)
		require.NoError(t, err)

		assert.Len(t, result, 2, "should return all 2 configs")
		assert.Equal(t, uint64(500), result[ccipocr3.ChainSelector(2001)].MinSeqNr)
		assert.Equal(t, uint64(600), result[ccipocr3.ChainSelector(2002)].MinSeqNr)
	})

	t.Run("specific selectors return only matching configs", func(t *testing.T) {
		sourceConfigsGot := offrampview.SourceChainConfigMap{
			3001: makeConfig(100, true),
			3002: makeConfig(200, true),
			3003: makeConfig(300, true),
		}

		selectors := []ccipocr3.ChainSelector{3001, 3003}
		result, err := filterSourceChainConfigs(sourceConfigsGot, selectors)
		require.NoError(t, err)

		assert.Len(t, result, 2, "should return only 2 matching configs")
		assert.Equal(t, uint64(100), result[ccipocr3.ChainSelector(3001)].MinSeqNr)
		assert.Equal(t, uint64(300), result[ccipocr3.ChainSelector(3003)].MinSeqNr)
		_, exists := result[ccipocr3.ChainSelector(3002)]
		assert.False(t, exists, "selector 3002 should not be in result")
	})

	t.Run("non-existent selectors are skipped", func(t *testing.T) {
		sourceConfigsGot := offrampview.SourceChainConfigMap{
			4001: makeConfig(100, true),
			4002: makeConfig(200, true),
		}

		// Request selectors that don't all exist
		selectors := []ccipocr3.ChainSelector{4001, 9999, 8888}
		result, err := filterSourceChainConfigs(sourceConfigsGot, selectors)
		require.NoError(t, err)

		assert.Len(t, result, 1, "should return only 1 existing config")
		assert.Equal(t, uint64(100), result[ccipocr3.ChainSelector(4001)].MinSeqNr)
	})

	t.Run("all requested selectors non-existent returns empty map", func(t *testing.T) {
		sourceConfigsGot := offrampview.SourceChainConfigMap{
			5001: makeConfig(100, true),
		}

		selectors := []ccipocr3.ChainSelector{9999, 8888, 7777}
		result, err := filterSourceChainConfigs(sourceConfigsGot, selectors)
		require.NoError(t, err)

		assert.Empty(t, result, "should return empty map when no selectors match")
	})

	t.Run("empty sourceConfigsGot with selectors returns empty map", func(t *testing.T) {
		sourceConfigsGot := offrampview.SourceChainConfigMap{}

		selectors := []ccipocr3.ChainSelector{1001, 1002}
		result, err := filterSourceChainConfigs(sourceConfigsGot, selectors)
		require.NoError(t, err)

		assert.Empty(t, result, "should return empty map")
	})

	t.Run("config fields are correctly converted", func(t *testing.T) {
		onRampAddr := common.CrossChainAddress{0xAA, 0xBB, 0xCC}
		sourceConfigsGot := offrampview.SourceChainConfigMap{
			6001: {
				Router:                    testAddr,
				IsEnabled:                 true,
				MinSeqNr:                  42,
				IsRMNVerificationDisabled: true,
				OnRamp:                    onRampAddr,
			},
		}

		selectors := []ccipocr3.ChainSelector{6001}
		result, err := filterSourceChainConfigs(sourceConfigsGot, selectors)
		require.NoError(t, err)

		assert.Len(t, result, 1)
		config := result[ccipocr3.ChainSelector(6001)]
		assert.True(t, config.IsEnabled)
		assert.Equal(t, uint64(42), config.MinSeqNr)
		assert.True(t, config.IsRMNVerificationDisabled)
		assert.Equal(t, ccipocr3.UnknownAddress(onRampAddr), config.OnRamp)
	})
}
