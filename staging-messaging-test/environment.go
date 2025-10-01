package main

import (
	"context"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/stretchr/testify/require"
	tonaddress "github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

type TestEnvironment struct {
	RouterAddress *tonaddress.Address
	DestSelector  uint64
	ReceiverBytes []byte
	ReceiverHex   string
	MessageData   string
	API           *ton.APIClient
	Wallet        *wallet.Wallet
	EthClient     *ethclient.Client
}

func setupTestEnvironment(t *testing.T, ctx context.Context) *TestEnvironment {
	env := loadEnv(t)

	routerAddress, err := tonaddress.ParseAddr(env.TonRouterAddress)
	require.NoError(t, err, "failed to parse %s", EnvTonRouterAddress)

	api := getAPIClient(t)

	w, err := wallet.FromSeed(api, strings.Fields(env.TonSenderWalletSeedPhrase), wallet.V3R2)
	require.NoError(t, err, "wallet init failed")

	mc, err := api.CurrentMasterchainInfo(ctx)
	require.NoError(t, err, "Failed to get masterchain info")

	balance, err := w.GetBalance(ctx, mc)
	require.NoError(t, err, "Failed to get wallet balance")
	t.Logf("Wallet balance: %s", balance.String())

	ethClient := getEthClient(t, env.SepoliaRPCURL)

	return &TestEnvironment{
		RouterAddress: routerAddress,
		DestSelector:  env.EvmDestChainSelector,
		ReceiverBytes: env.EvmReceiverBytes,
		ReceiverHex:   env.EvmReceiverHex,
		MessageData:   env.CcipMessage,
		API:           api,
		Wallet:        w,
		EthClient:     ethClient,
	}
}
func getEthClient(t *testing.T, rpc string) *ethclient.Client {
	if rpc == "" { // default if optional var unset
		rpc = "https://ethereum-sepolia-rpc.publicnode.com"
	}
	c, err := ethclient.Dial(rpc)
	require.NoError(t, err, "failed to connect sepolia rpc")
	return c
}

func getAPIClient(t *testing.T) *ton.APIClient {
	client := liteclient.NewConnectionPool()
	cfg, err := liteclient.GetConfigFromUrl(context.Background(), "https://ton.org/testnet-global.config.json")
	if err != nil {
		t.Fatalf("Failed to get testnet config: %v", err)
	}

	err = client.AddConnectionsFromConfig(context.Background(), cfg)
	if err != nil {
		t.Fatalf("Failed to connect to TON network: %v", err)
	}

	api := ton.NewAPIClient(client)
	return api
}
