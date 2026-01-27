package chainaccessor

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
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
