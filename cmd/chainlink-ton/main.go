package main

import (
	"context"
	"fmt"

	"github.com/hashicorp/go-plugin"

	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"

	"github.com/smartcontractkit/chainlink-ton/pkg/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/relay"
)

const (
	loggerName = "PluginTON"
)

func main() {
	s := loop.MustNewStartedServer(loggerName)
	defer s.Stop()

	p := &pluginRelayer{Plugin: loop.Plugin{Logger: s.Logger}}
	defer s.Logger.ErrorIfFn(p.Close, "failed to close")

	s.MustRegister(p)

	stopCh := make(chan struct{})
	defer close(stopCh)

	plugin.Serve(&plugin.ServeConfig{
		HandshakeConfig: loop.PluginRelayerHandshakeConfig(),
		Plugins: map[string]plugin.Plugin{
			loop.PluginRelayerName: &loop.GRPCPluginRelayer{
				PluginServer: p,
				BrokerConfig: loop.BrokerConfig{
					StopCh:   stopCh,
					Logger:   s.Logger,
					GRPCOpts: s.GRPCOpts,
				},
			},
		},
		GRPCServer: s.GRPCOpts.NewServer,
	})
}

type pluginRelayer struct {
	loop.Plugin
	ds sqlutil.DataSource
}

// NewRelayer implements the Loopp factory method used by the Loopp server to instantiate a relayer
// [github.com/smartcontractkit/chainlink-common/pkg/loop.PluginRelayer]
func (p *pluginRelayer) NewRelayer(ctx context.Context, rawConfig string, loopKs, csaKeystore core.Keystore, capRegistry core.CapabilitiesRegistry) (loop.Relayer, error) {
	cfg, err := config.NewDecodedTOMLConfig(rawConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to read configs: %w", err)
	}

	opts := relay.ChainOpts{
		Logger:   p.Logger,
		KeyStore: loopKs,
		DS:       p.ds,
	}

	chain, err := relay.NewChain(cfg, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to create TON chain: %w", err)
	}

	service := relay.NewService(chain)

	relayer := relay.NewRelayer(p.Logger, chain, service, capRegistry)
	p.SubService(relayer)
	return relayer, nil
}
