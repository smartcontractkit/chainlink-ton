package ccip

import (
	"errors"

	"github.com/Masterminds/semver/v3"
	"github.com/ethereum/go-ethereum/common"

	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	ccipdeployutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
)

// mcmsVersion is the MCMS contract version (RBACTimelock 1.0.0) that
// resolveUltraFastCurseTimelock looks up when deploying the RMN. It mirrors
// mcms_ops.MCMSVersion from chainlink-ccip/chains/evm/deployment/v1_0_0/operations,
// which is not importable from this module (it lives in the chainlink-ccip module
// pinned at an older version that does not expose it).
var mcmsVersion = semver.MustParse("1.0.0")

// ultraFastCurseTimelockAddress is a non-zero placeholder address used to stand in
// for the Ultra Fast Curse RBACTimelock. DeployChainContracts only ever passes this
// address as a constructor argument to the RMN (CurseAdmins); it is never called, so
// a real MCMS instance is not required for these tests. This mirrors the
// testsetup.UltraFastCurseMCMSRefs pattern used by the chainlink-ccip integration
// tests. The address must be non-zero because the RMN's AuthorizedCallers rejects the
// zero address.
const ultraFastCurseTimelockAddress = "0x00000000000000000000000000000000000c0e5e"

// SeedUltraFastCurseMCMS registers an Ultra Fast Curse RBACTimelock ref for every EVM
// chain in the environment, returning a new environment backed by the updated
// datastore.
//
// The bumped chainlink-ccip/deployment version requires an UltraFastCurse RBACTimelock
// to be present in the environment datastore before DeployChainContracts can deploy the
// RMN (it is passed as the RMN's curse admin). TON does not implement Ultra Fast Curse,
// so for these EVM-side deploys we seed a placeholder ref rather than deploying a real
// MCMS instance — the address is only ever used as a constructor argument.
func SeedUltraFastCurseMCMS(env cldf.Environment) (cldf.Environment, error) {
	selectors := make([]uint64, 0, len(env.BlockChains.EVMChains()))
	for sel := range env.BlockChains.EVMChains() {
		selectors = append(selectors, sel)
	}

	ds := datastore.NewMemoryDataStore()
	if env.DataStore != nil {
		if err := ds.Merge(env.DataStore); err != nil {
			return cldf.Environment{}, err
		}
	}

	for _, sel := range selectors {
		ref := datastore.AddressRef{
			ChainSelector: sel,
			Type:          datastore.ContractType(ccipdeployutils.RBACTimelock),
			Version:       mcmsVersion,
			Qualifier:     ccipdeployutils.UltraFastCurseMCMSQualifier,
			Address:       common.HexToAddress(ultraFastCurseTimelockAddress).Hex(),
		}
		// Idempotent: the ref may already exist when re-seeding a merged datastore.
		if err := ds.Addresses().Add(ref); err != nil && !errors.Is(err, datastore.ErrAddressRefExists) {
			return cldf.Environment{}, err
		}
	}

	env.DataStore = ds.Seal()
	return env, nil
}
