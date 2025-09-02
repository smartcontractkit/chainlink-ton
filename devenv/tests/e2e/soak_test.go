package e2e_test

import (
	"testing"

	"github.com/smartcontractkit/chainlink-testing-framework/framework/clclient"
	"github.com/stretchr/testify/require"

	de "github.com/smartcontractkit/chainlink-ton/devenv"
)

func TestE2E(t *testing.T) {
	out, err := de.LoadOutput[de.Cfg]("../../env-out.toml")
	require.NoError(t, err)
	c, _, _, err := de.ETHClient(out.Blockchains[0].Out.Nodes[0].ExternalWSUrl, out.TON.GasSettings)
	require.NoError(t, err)
	clNodes, err := clclient.New(out.NodeSets[0].Out.CLNodes)
	require.NoError(t, err)
	_ = clNodes
	_ = c
	_ = out.TON.Addresses
	// use out.TON.Address, put CLDF JSON output there and then interact with contracts
}
