package operation

import (
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
)

type TonDeps struct {
	AB       *cldf.AddressBookMap
	TonChain cldf_ton.Chain
}
