package config

import (
	"errors"
	"fmt"
	"strings"

	"github.com/pelletier/go-toml/v2"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
	relaytypes "github.com/smartcontractkit/chainlink-common/pkg/types"
)

type TOMLConfig struct {
	// Do not access directly. Use [IsEnabled]
	Enabled *bool

	// Chain configuration
	ChainID         string
	NetworkName     string
	NetworkNameFull string

	// Chain-specific components configuration
	Chain

	Nodes Nodes
}

// decodeConfig decodes the rawConfig as (TON) TOML and sets default values
func NewDecodedTOMLConfig(rawConfig string) (*TOMLConfig, error) {
	d := toml.NewDecoder(strings.NewReader(rawConfig))
	d.DisallowUnknownFields()

	var cfg TOMLConfig
	if err := d.Decode(&cfg); err != nil {
		return &TOMLConfig{}, fmt.Errorf("failed to decode config toml: %w:\n\t%s", err, rawConfig)
	}

	if err := cfg.ValidateConfig(); err != nil {
		return &TOMLConfig{}, fmt.Errorf("invalid ton config: %w", err)
	}

	if !cfg.IsEnabled() {
		return &TOMLConfig{}, fmt.Errorf("cannot create new chain with ID %s: config is disabled", cfg.ChainID)
	}

	cfg.SetDefaults()
	return &cfg, nil
}

func (c *TOMLConfig) SetDefaults() {
	if c.TransactionManager == nil {
		c.TransactionManager = DefaultConfigSet.TransactionManager
	}

	// Set network name full defaults
	if c.NetworkNameFull == "" {
		c.NetworkNameFull = fmt.Sprintf("%s-%s", ChainFamilyName, c.NetworkName)
	}
}

func (c *TOMLConfig) IsEnabled() bool {
	return c.Enabled == nil || *c.Enabled
}

func (c *TOMLConfig) SetFrom(f *TOMLConfig) {
	c.Enabled = f.Enabled

	c.ChainID = f.ChainID
	c.NetworkName = f.NetworkName
	c.NetworkNameFull = f.NetworkNameFull

	setFromChain(&c.Chain, &f.Chain)
	c.Nodes.SetFrom(&f.Nodes)
}

func NodeStatus(n *Node, id string) (relaytypes.NodeStatus, error) {
	var s relaytypes.NodeStatus
	s.ChainID = id
	s.Name = *n.Name
	b, err := toml.Marshal(n)
	if err != nil {
		return relaytypes.NodeStatus{}, err
	}
	s.Config = string(b)
	return s, nil
}

func setFromChain(c, f *Chain) {
	if f.TransactionManager != nil {
		c.TransactionManager = f.TransactionManager
	}
}

func (c *TOMLConfig) ValidateConfig() (err error) {
	if c.ChainID == "" {
		err = errors.Join(err, config.ErrEmpty{Name: "ChainID", Msg: "required for all chains"})
	}

	if len(c.Nodes) == 0 {
		err = errors.Join(err, config.ErrMissing{Name: "Nodes", Msg: "must have at least one node"})
	} else {
		for _, node := range c.Nodes {
			err = errors.Join(err, node.ValidateConfig())
		}
	}

	return
}

func (c *TOMLConfig) TOMLString() (string, error) {
	b, err := toml.Marshal(c)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
