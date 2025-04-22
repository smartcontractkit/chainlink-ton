package main

import (
	"context"
	"fmt"

	"github.com/hashicorp/go-plugin"

	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"

	// TODO: import the ton relayer package
)

const (
	loggerName = "PluginTON"
)

func main() {
	s := loop.MustNewStartedServer(loggerName)
	defer s.Stop()

	p := &pluginRelayer{Plugin: loop.Plugin{Logger: s.Logger}}
	defer s.Logger.ErrorIfFn(p.Close, "Failed to close")

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

// NewRelayer implements the Loopp factory method used by the Loopp server to instantiate a aptos relayer
// [github.com/smartcontractkit/chainlink-common/pkg/loop.PluginRelayer]
// loopKs must be an implementation that can construct a aptos keystore adapter
// [github.com/smartcontractkit/chainlink-aptos/relayer/txm.NewKeystoreAdapter]
func (p *pluginRelayer) NewRelayer(ctx context.Context, rawConfig string, loopKs loop.Keystore, capRegistry core.CapabilitiesRegistry) (loop.Relayer, error) {
	// TODO: Initialize the chain and relayer service
	return nil, fmt.Errorf("not implemented")
}
