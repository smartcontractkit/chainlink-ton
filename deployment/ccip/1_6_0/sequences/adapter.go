package sequences

import (
	"github.com/Masterminds/semver/v3"
	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
)

func init() {
	v, err := semver.NewVersion("1.6.0")
	if err != nil {
		panic(err)
	}
	lanes.GetLaneAdapterRegistry().RegisterLaneAdapter(chainsel.FamilyTon, v, &TonAdapter{})
	deploy.GetRegistry().RegisterDeployer(chainsel.FamilyTon, v, &TonAdapter{})
}

type TonAdapter struct{}
