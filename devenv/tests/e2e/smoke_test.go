package e2e

import (
	"testing"

	de "github.com/smartcontractkit/chainlink-ton/devenv"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-testing-framework/framework/clclient"
)

func TestE2ESmoke(t *testing.T) {
	in, err := de.LoadOutput[de.Cfg]("../../env-out.toml")
	require.NoError(t, err)
	c, _, _, err := de.ETHClient(in.Blockchains[0].Out.Nodes[0].ExternalWSUrl, in.OnChainSettings.GasSettings)
	require.NoError(t, err)
	clNodes, err := clclient.New(in.NodeSets[0].Out.CLNodes)
	require.NoError(t, err)
	_ = clNodes
	_ = c
	// connect your contracts with CLDF here and assert CCIP lanes are working or use raw clients
}
