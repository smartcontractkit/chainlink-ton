package config

import (
	mnCfg "github.com/smartcontractkit/chainlink-framework/multinode/config"
)

type Nodes []*Node

type TOMLConfig struct {
	ChainID *string
	// Do not access directly, use [IsEnabled]
	Enabled *bool
	Chain
	MultiNode mnCfg.MultiNodeConfig
	Nodes     Nodes
}
