package sequences

import (
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/stretchr/testify/require"

	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"

	ccipdutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
)

func TestGetAddressRefUsesVersionFromQualifier(t *testing.T) {
	selector := uint64(123)
	v003 := semver.MustParse("0.0.3")
	v004 := semver.MustParse("0.0.4")
	refs := []cldfds.AddressRef{
		{
			ChainSelector: selector,
			Type:          cldfds.ContractType(ccipdutils.RBACTimelock),
			Version:       v003,
			Qualifier:     ccipdutils.CLLQualifier,
			Address:       "version-003",
		},
		{
			ChainSelector: selector,
			Type:          cldfds.ContractType(ccipdutils.RBACTimelock),
			Version:       v004,
			Qualifier:     ccipdutils.CLLQualifier,
			Address:       "version-004",
		},
	}

	qualifier, version, err := parseQualifierVersion(ccipdutils.CLLQualifier + "@0.0.3")
	require.NoError(t, err)

	ref := getAddressRef(addressRefStore(t, refs), selector, ccipdutils.RBACTimelock, qualifier, version)

	require.Equal(t, "version-003", ref.Address)
}

func TestGetAddressRefUsesHighestVersionWhenQualifierDoesNotSpecifyVersion(t *testing.T) {
	selector := uint64(123)
	v003 := semver.MustParse("0.0.3")
	v004 := semver.MustParse("0.0.4")
	v005 := semver.MustParse("0.0.5")
	refs := []cldfds.AddressRef{
		{
			ChainSelector: selector,
			Type:          cldfds.ContractType(ccipdutils.RBACTimelock),
			Version:       v003,
			Qualifier:     ccipdutils.CLLQualifier,
			Address:       "version-003",
		},
		{
			ChainSelector: selector,
			Type:          cldfds.ContractType(ccipdutils.RBACTimelock),
			Version:       v004,
			Qualifier:     ccipdutils.CLLQualifier,
			Address:       "version-004",
		},
		{
			ChainSelector: selector,
			Type:          cldfds.ContractType(ccipdutils.RBACTimelock),
			Version:       v005,
			Qualifier:     "other",
			Address:       "other-qualifier-version-005",
		},
		{
			ChainSelector: selector + 1,
			Type:          cldfds.ContractType(ccipdutils.RBACTimelock),
			Version:       v005,
			Qualifier:     ccipdutils.CLLQualifier,
			Address:       "other-selector-version-005",
		},
		{
			ChainSelector: selector,
			Type:          cldfds.ContractType(ccipdutils.ProposerManyChainMultisig),
			Version:       v005,
			Qualifier:     ccipdutils.CLLQualifier,
			Address:       "other-type-version-005",
		},
	}

	ref := getAddressRef(addressRefStore(t, refs), selector, ccipdutils.RBACTimelock, ccipdutils.CLLQualifier, nil)

	require.Equal(t, "version-004", ref.Address)
}

func TestGetAddressRefDoesNotFilterQualifierWhenEmpty(t *testing.T) {
	selector := uint64(123)
	v003 := semver.MustParse("0.0.3")
	v004 := semver.MustParse("0.0.4")
	refs := []cldfds.AddressRef{
		{
			ChainSelector: selector,
			Type:          cldfds.ContractType(ccipdutils.RBACTimelock),
			Version:       v003,
			Qualifier:     "",
			Address:       "empty-qualifier-version-003",
		},
		{
			ChainSelector: selector,
			Type:          cldfds.ContractType(ccipdutils.RBACTimelock),
			Version:       v004,
			Qualifier:     ccipdutils.CLLQualifier,
			Address:       "cll-qualifier-version-004",
		},
	}

	ref := getAddressRef(addressRefStore(t, refs), selector, ccipdutils.RBACTimelock, "", nil)

	require.Equal(t, "cll-qualifier-version-004", ref.Address)
}

func TestGetAddressRefReturnsEmptyWhenSpecifiedVersionDoesNotMatch(t *testing.T) {
	selector := uint64(123)
	v003 := semver.MustParse("0.0.3")
	refs := []cldfds.AddressRef{
		{
			ChainSelector: selector,
			Type:          cldfds.ContractType(ccipdutils.RBACTimelock),
			Version:       v003,
			Qualifier:     ccipdutils.CLLQualifier,
			Address:       "version-003",
		},
	}

	ref := getAddressRef(addressRefStore(t, refs), selector, ccipdutils.RBACTimelock, ccipdutils.CLLQualifier, semver.MustParse("0.0.4"))

	require.Empty(t, ref.Address)
}

func TestParseQualifierVersionReturnsInvalidQualifierVersionError(t *testing.T) {
	_, _, err := parseQualifierVersion(ccipdutils.CLLQualifier + "@not-a-version")

	require.ErrorContains(t, err, "invalid version in qualifier")
}

func TestParseQualifierVersionSplitsQualifierAndVersion(t *testing.T) {
	qualifier, version, err := parseQualifierVersion(ccipdutils.CLLQualifier + "@0.0.3")

	require.NoError(t, err)
	require.Equal(t, ccipdutils.CLLQualifier, qualifier)
	require.Equal(t, semver.MustParse("0.0.3"), version)
}

func TestParseQualifierVersionLeavesEmptyQualifierEmpty(t *testing.T) {
	qualifier, version, err := parseQualifierVersion("")

	require.NoError(t, err)
	require.Empty(t, qualifier)
	require.Nil(t, version)
}

func addressRefStore(t *testing.T, refs []cldfds.AddressRef) cldfds.AddressRefStore {
	t.Helper()

	ds := cldfds.NewMemoryDataStore()
	for _, ref := range refs {
		require.NoError(t, ds.Addresses().Add(ref))
	}

	return ds.Addresses()
}
