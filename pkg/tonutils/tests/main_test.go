package tests

import (
	"testing"

	"github.com/smartcontractkit/chainlink-testing-framework/framework"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"
)

type CfgTon struct {
	BlockchainA *blockchain.Input `toml:"blockchain_a" validate:"required"`
}

var bc *blockchain.Output

func TestMain(m *testing.M) {
	// Deploy MyLocalTON
	in, err := framework.Load[CfgTon](nil)
	if err != nil {
		panic(err)
	}

	bc, err = blockchain.NewBlockchainNetwork(in.BlockchainA)
	if err != nil {
		panic(err)
	}

	m.Run()
}
