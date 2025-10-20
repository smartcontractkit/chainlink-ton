package env

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/pelletier/go-toml/v2"
)

type Config struct {
	Onchain OnchainConfig `toml:"onchain"`
}

type OnchainConfig struct {
	TonBlockchains []TonBlockchain `toml:"ton_blockchain"`
	EvmBlockchains []EvmBlockchain `toml:"evm_blockchain"`
}

type TonBlockchain struct {
	ChainID       int    `toml:"chainID"`
	Name          string `toml:"name"`
	HTTPURL       string `toml:"httpURL"`
	DeployerKey   string `toml:"deployerKey"`
	WalletVersion string `toml:"walletVersion"`
}

type EvmBlockchain struct {
	ChainID     int    `toml:"chainID"`
	Name        string `toml:"name"`
	HTTPURL     string `toml:"httpURL"`
	WSSURL      string `toml:"wssURL"`
	DeployerKey string `toml:"deployerKey"`
}

func LoadEnvironmentConfig(filename string) (*Config, error) {
	// Get the directory where this source file lives.
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		return nil, errors.New("unable to determine caller path")
	}
	dir := filepath.Dir(thisFile)

	// Build absolute path to config.toml
	configPath := filepath.Join(dir, filename)

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file %q: %w", configPath, err)
	}

	var cfg Config
	if err := toml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse TOML: %w", err)
	}

	return &cfg, nil
}
