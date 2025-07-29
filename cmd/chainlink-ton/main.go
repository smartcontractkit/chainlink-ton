package main

import (
	"context"
	"fmt"

	"github.com/hashicorp/go-plugin"

	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"

	toncfg "github.com/smartcontractkit/chainlink-ton/pkg/config"
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
}

// NewRelayer implements the Loopp factory method used by the Loopp server to instantiate a relayer
// [github.com/smartcontractkit/chainlink-common/pkg/loop.PluginRelayer]
func (p *pluginRelayer) NewRelayer(ctx context.Context, rawConfig string, loopKs loop.Keystore, csaKeystore core.Keystore, capRegistry core.CapabilitiesRegistry) (loop.Relayer, error) {
	cfg := toncfg.TOMLConfig{}

	// TODO(NONEVM-1460): decode TOML config
	opts := relay.ChainOpts{
		Logger:   p.Logger,
		KeyStore: loopKs,
		DS:       nil, // TODO(NONEVM-1460): add ds
	}

	chain, err := relay.NewChain(&cfg, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to create TON chain: %w", err)
	}

	relayer := relay.NewRelayer(p.Logger, chain, capRegistry)
	p.SubService(relayer)
	return relayer, nil
}
