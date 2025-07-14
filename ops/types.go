package ops

import (
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
)

type TonDeps struct {
	AB       *cldf.AddressBookMap
	TonChain cldf_ton.Chain
}

type OpTxInput[I any] struct {
	Input I
}

type OpTxResult[O any] struct {
	Objects O
}
