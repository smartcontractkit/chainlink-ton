package main

import (
	"encoding/hex"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Environment variable names.
const (
	EnvTonRouterAddress          = "TON_ROUTER_ADDRESS"
	EnvEvmDestChainSelector      = "EVM_DEST_CHAIN_SELECTOR"
	EnvEvmReceiverAddress        = "EVM_RECEIVER_ADDRESS"
	EnvCcipMessage               = "CCIP_MESSAGE"
	EnvTonSenderWalletSeedPhrase = "TON_SENDER_WALLET_SEED_PHRASE"
	EnvSepoliaRPCURL             = "SEPOLIA_RPC_URL"
)

// LoadedEnv holds all parsed / normalized environment variables needed for the test.
type LoadedEnv struct {
	TonRouterAddress          string
	EvmDestChainSelector      uint64
	EvmReceiverHex            string // normalized (no 0x prefix)
	EvmReceiverBytes          []byte // 32-byte left padded
	CcipMessage               string
	TonSenderWalletSeedPhrase string
	SepoliaRPCURL             string // optional, may be empty => default used
}

func loadEnv(t *testing.T) LoadedEnv {
	t.Helper()

	router := getRequiredEnv(t, EnvTonRouterAddress)
	selector := getRequiredUint64Env(t, EnvEvmDestChainSelector)
	receiverHex, receiverBytes := getRequiredHexEnv(t, EnvEvmReceiverAddress)
	receiverBytes = leftPadTo32(t, receiverBytes)

	msg := os.Getenv(EnvCcipMessage)
	if msg == "" {
		msg = "TON staging message test from ton to sepolia (new++)"
	}

	seed := getRequiredEnv(t, EnvTonSenderWalletSeedPhrase)
	rpc := os.Getenv(EnvSepoliaRPCURL) // optional

	return LoadedEnv{
		TonRouterAddress:          router,
		EvmDestChainSelector:      selector,
		EvmReceiverHex:            receiverHex,
		EvmReceiverBytes:          receiverBytes,
		CcipMessage:               msg,
		TonSenderWalletSeedPhrase: seed,
		SepoliaRPCURL:             rpc,
	}
}

func getRequiredEnv(t *testing.T, key string) string {
	t.Helper()
	v := os.Getenv(key)
	require.NotEmpty(t, v, "%s not set", key)
	return v
}

func getRequiredUint64Env(t *testing.T, key string) uint64 {
	t.Helper()
	raw := getRequiredEnv(t, key)
	n, err := strconv.ParseUint(raw, 10, 64)
	require.NoError(t, err, "cannot parse %s", key)
	return n
}

func getRequiredHexEnv(t *testing.T, key string) (string, []byte) {
	t.Helper()
	raw := getRequiredEnv(t, key)
	raw = strings.TrimPrefix(raw, "0x")
	b, err := hex.DecodeString(raw)
	require.NoError(t, err, "invalid %s hex", key)
	return raw, b
}

func leftPadTo32(t *testing.T, in []byte) []byte {
	t.Helper()
	require.LessOrEqual(t, len(in), 32, "value longer than 32 bytes")
	if len(in) == 32 {
		return in
	}
	out := make([]byte, 32)
	copy(out[32-len(in):], in)
	return out
}
