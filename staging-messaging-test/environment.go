package main

import (
	"context"
	"encoding/hex"
	"os"
	"strconv"
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
	routerAddress, err := tonaddress.ParseAddr(os.Getenv("TON_ROUTER_ADDRESS"))
	require.NoError(t, err, "Failed to parse Ton Router Address from Env")

	destSelStr := os.Getenv("EVM_DEST_CHAIN_SELECTOR")
	require.NotEmpty(t, destSelStr, "EVM_DEST_CHAIN_SELECTOR not set")
	destSelector, err := strconv.ParseUint(destSelStr, 10, 64)
	require.NoError(t, err, "cannot parse EVM_DEST_CHAIN_SELECTOR")

	receiverHex := os.Getenv("EVM_RECEIVER_ADDRESS")
	require.NotEmpty(t, receiverHex, "EVM_RECEIVER_ADDRESS not set")
	receiverHex = strings.TrimPrefix(receiverHex, "0x")
	receiverBytes, err := hex.DecodeString(receiverHex)
	require.NoError(t, err, "invalid EVM_RECEIVER_ADDRESS hex")

	msgData := os.Getenv("CCIP_MESSAGE")
	if msgData == "" {
		msgData = "hello-ton->evm"
	}

	api := getAPIClient(t)

	walletSeedPhrase := os.Getenv("TON_SENDER_WALLET_SEED_PHRASE")
	require.NotEmpty(t, walletSeedPhrase, "TON_SENDER_WALLET_SEED_PHRASE not set")

	w, err := wallet.FromSeed(api, strings.Fields(walletSeedPhrase), wallet.V3R2)
	require.NoError(t, err, "wallet init failed")

	mc, err := api.CurrentMasterchainInfo(ctx)
	require.NoError(t, err, "Failed to get masterchain info")

	balance, err := w.GetBalance(ctx, mc)
	require.NoError(t, err, "Failed to get wallet balance")
	t.Logf("Wallet address: %s", w.Address().String())
	t.Logf("Wallet balance: %s", balance.String())

	ethClient := getEthClient(t)

	return &TestEnvironment{
		RouterAddress: routerAddress,
		DestSelector:  destSelector,
		ReceiverBytes: receiverBytes,
		ReceiverHex:   receiverHex,
		MessageData:   msgData,
		API:           api,
		Wallet:        w,
		EthClient:     ethClient,
	}
}

func getEthClient(t *testing.T) *ethclient.Client {
	rpc := os.Getenv("SEPOLIA_RPC_URL")
	if rpc == "" {
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
