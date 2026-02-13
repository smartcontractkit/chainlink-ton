package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"

	"github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/fastcurse"
	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
)

func init() {
	v, err := semver.NewVersion("1.6.0")
	if err != nil {
		panic(err)
	}

	// Register separate adapters for each interface
	deploy.GetRegistry().RegisterDeployer(chainsel.FamilyTon, v, &TonDeployAdapter{})
	lanes.GetLaneAdapterRegistry().RegisterLaneAdapter(chainsel.FamilyTon, v, &TonLaneAdapter{})
	deploy.GetTransferOwnershipRegistry().RegisterAdapter(chainsel.FamilyTon, v, &TonTransferOwnershipAdapter{})
	curseAdapter := &TonCurseAdapter{}
	fastcurse.GetCurseRegistry().RegisterNewCurse(
		fastcurse.CurseRegistryInput{
			CursingFamily:       chainsel.FamilyTon,
			CursingVersion:      v,
			CurseAdapter:        curseAdapter,
			CurseSubjectAdapter: curseAdapter,
		},
	)
	changesets.GetRegistry().RegisterMCMSReader(chainsel.FamilyTon, &MCMSReaderAdapter{})
}

// Standalone functions - can be used by any adapter without coupling
func getOnRampAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	stateCCIP, err := tonstate.LoadCCIPOnChainStateUsingDataStore(ds, chainSelector)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	return convertAddress(stateCCIP.OnRamp)
}

func getOffRampAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	stateCCIP, err := tonstate.LoadCCIPOnChainStateUsingDataStore(ds, chainSelector)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	return convertAddress(stateCCIP.OffRamp)
}

func getFQAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	stateCCIP, err := tonstate.LoadCCIPOnChainStateUsingDataStore(ds, chainSelector)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	return convertAddress(stateCCIP.FeeQuoter)
}

func getRouterAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	stateCCIP, err := tonstate.LoadCCIPOnChainStateUsingDataStore(ds, chainSelector)
	if err != nil {
		return []byte{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	return convertAddress(stateCCIP.Router)
}

func convertAddress(address address.Address) ([]byte, error) {
	addrCodec := codec.NewAddressCodec()
	rawAddress, err := addrCodec.AddressStringToBytes(address.String())
	if err != nil {
		return []byte{}, fmt.Errorf("failed to convert TON address to bytes: %w", err)
	}

	return rawAddress, nil
}
