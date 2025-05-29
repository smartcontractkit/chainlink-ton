package tests

import (
	"testing"

	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"
)

var bc *blockchain.Output

func TestMain(m *testing.M) {
	// Deploy MyLocalTON
	bcInput := &blockchain.Input{
		Image: "ghcr.io/neodix42/mylocalton-docker:latest", // optional
		Type:  "ton",
	}
	var err error
	bc, err = blockchain.NewBlockchainNetwork(bcInput)

	if err != nil {
		panic(err)
	}

	m.Run()
}
