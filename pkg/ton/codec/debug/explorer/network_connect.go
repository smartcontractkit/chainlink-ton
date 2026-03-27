package explorer

import (
	"context"
	"fmt"
	"strconv"

	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"
)

func connect(ctx context.Context, net string) (*ton.APIClient, error) {
	pool := liteclient.NewConnectionPool()
	switch net {
	case "mainnet":
		configURL := "https://ton-blockchain.github.io/global.config.json"
		if err := pool.AddConnectionsFromConfigUrl(ctx, configURL); err != nil {
			return nil, fmt.Errorf("failed to add connections from config url: %w", err)
		}
	case "testnet":
		configURL := "https://ton.org/testnet-global.config.json"
		if err := pool.AddConnectionsFromConfigUrl(ctx, configURL); err != nil {
			return nil, fmt.Errorf("failed to add connections from config url: %w", err)
		}
	case "mylocalton":
		containerID, err := findMylocaltonContainer(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to find mylocalton container: %w", err)
		}

		inspect, err := inspectContainer(ctx, containerID)
		if err != nil {
			return nil, fmt.Errorf("failed to inspect container %s: %w", containerID, err)
		}

		configPort, err := getPortMapping(inspect, "8000")
		if err != nil {
			return nil, fmt.Errorf("failed to get port mapping for config server: %w", err)
		}

		configURL := fmt.Sprintf("http://127.0.0.1:%s/localhost.global.config.json", configPort)
		config, err := liteclient.GetConfigFromUrl(ctx, configURL)
		if err != nil {
			return nil, fmt.Errorf("failed to get config from url: %w", err)
		}

		liteserverConfig := config.Liteservers[0]
		liteserverPort := strconv.Itoa(liteserverConfig.Port)
		externalLiteserverPort, err := getPortMapping(inspect, liteserverPort)
		if err != nil {
			return nil, fmt.Errorf("failed to get port mapping for liteserver: %w", err)
		}

		connectionString := "127.0.0.1:" + externalLiteserverPort
		if err = pool.AddConnection(ctx, connectionString, liteserverConfig.ID.Key); err != nil {
			return nil, fmt.Errorf("failed to add localton connection: %w", err)
		}
	default:
		if err := pool.AddConnectionsFromConfigUrl(ctx, net); err != nil {
			return nil, fmt.Errorf("failed to add connections from config url: %w", err)
		}
	}

	return ton.NewAPIClient(pool, ton.ProofCheckPolicyFast), nil
}
