package test_utils

import (
	"context"
	"fmt"
	"math/big"
	"os"
	"os/exec"
	"path"
	"strings"
	"testing"

	"github.com/joho/godotenv"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/stretchr/testify/assert"
	liteclient "github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	ton "github.com/xssnick/tonutils-go/ton"
	wallet "github.com/xssnick/tonutils-go/ton/wallet"
)

func GetRepoRootDir() string {
	// use git rev-parse --show-toplevel
	// to get the root directory of the git repository

	res := exec.Command("git", "rev-parse", "--show-toplevel")
	stdout, err := res.Output()
	if err != nil {
		panic(fmt.Sprintf("Failed to get repo root dir: %v", err))
	}
	rootDir := strings.TrimSpace(string(stdout))
	return rootDir
}

func GetBuildsDir() string {
	repoRoot := GetRepoRootDir()
	return path.Join(repoRoot, "contracts", "build")
}

func GetBuildDir(contractPath string) string {
	buildsDir := GetBuildsDir()
	return path.Join(buildsDir, contractPath)
}

func SetUpTest(t *testing.T, initialAmount *big.Int, fundedAccountsCount uint, liteapiURL string) (accounts []trace_tracking.SignedAPIClient) {

	// Connect to TON testnet
	client := liteclient.NewConnectionPool()
	cfg, err := liteclient.GetConfigFromUrl(context.Background(), fmt.Sprintf("http://%s/localhost.global.config.json", liteapiURL))
	assert.NoError(t, err, "Failed to get testnet config: %v", err)

	err = client.AddConnectionsFromConfig(context.Background(), cfg)
	assert.NoError(t, err, "Failed to connect to TON network: %v", err)

	// Initialize TON API client
	api := ton.NewAPIClient(client)

	// Get wallet for operations
	funderWallet := getWallet(t, api)

	// Run the spec tests, which are fully chain agnostic
	funder := trace_tracking.NewSignedAPIClient(api, *funderWallet)

	initialCoinAmount := tlb.FromNanoTON(initialAmount)

	accounts = make([]trace_tracking.SignedAPIClient, fundedAccountsCount)
	for i := range fundedAccountsCount {
		accounts[i] = createAndFundWallet(t, api, funder, initialCoinAmount)
	}

	return accounts
}

func GetRandomWallet(client ton.APIClientWrapped, version wallet.Version, option wallet.Option) (*wallet.Wallet, error) {
	seed := wallet.NewSeed()
	w, err := wallet.FromSeed(client, seed, version)
	if err != nil {
		return nil, fmt.Errorf("Failed to generate random wallet: %v", err)
	}
	pw, perr := wallet.FromPrivateKeyWithOptions(client, w.PrivateKey(), version, option)
	if perr != nil {
		return nil, fmt.Errorf("Failed to generate random wallet: %v", perr)
	}
	return pw, nil
}

func createAndFundWallet(t *testing.T, api *ton.APIClient, funder trace_tracking.SignedAPIClient, initialCoinAmount tlb.Coins) trace_tracking.SignedAPIClient {
	aliceWallet, err := GetRandomWallet(api, wallet.V3R2, wallet.WithWorkchain(0))
	assert.NoError(t, err, "Failed to create new wallet: %v", err)
	transferToAlice, err := funder.Wallet.BuildTransfer(aliceWallet.WalletAddress(), initialCoinAmount, false, "deposit")
	assert.NoError(t, err, "Failed to build transfer: %v", err)
	result, err := funder.SendAndWaitForTrace(context.TODO(), *aliceWallet.WalletAddress(), transferToAlice)
	assert.NoError(t, err, "Failed to send transaction: %v", err)
	assert.True(t, result.Success && !result.Bounced, "Transaction failed")
	alice := trace_tracking.NewSignedAPIClient(api, *aliceWallet)
	return alice
}

func GetWalletSeqno(apiClient trace_tracking.SignedAPIClient) (uint, error) {
	return UintFrom(Get(apiClient, "seqno"))
}

func Get(apiClient trace_tracking.SignedAPIClient, key string) (*ton.ExecutionResult, error) {
	block, err := apiClient.Client.CurrentMasterchainInfo(context.TODO())
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	return apiClient.Client.WaitForBlock(block.SeqNo).RunGetMethod(context.TODO(), block, apiClient.Wallet.WalletAddress(), key)
}

func UintFrom(res *ton.ExecutionResult, err error) (uint, error) {
	if err != nil {
		return 0, fmt.Errorf("failed to run get method: %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return 0, fmt.Errorf("failed to extract value: %w", err)
	}

	return uint(val.Int64()), nil
}

func getWallet(t *testing.T, api ton.APIClientWrapped) *wallet.Wallet {
	// Load .env file from the project root
	repoRoot := GetRepoRootDir()
	err := godotenv.Load(path.Join(repoRoot, "pkg/ton/trace_tracking/tests/.env"))
	if err != nil {
		// It's okay if the .env file doesn't exist in some environments
		// so we'll just log it instead of failing
		t.Logf("Warning: Error loading .env file: %v", err)
	}
	// Get seed phrase from environment variable
	seedPhrase := os.Getenv("SIGNER_WALLET_SEED_PHRASE")
	assert.NotEqual(t, seedPhrase, "", "Environment variable SIGNER_WALLET_SEED_PHRASE not set or empty")

	words := strings.Fields(seedPhrase)

	// Create wallet from seed with password
	w, err := wallet.FromSeed(api, words, wallet.V3R2)
	assert.NoError(t, err, "Failed to create wallet from seed: %v", err)

	baseFunderWallet, err := wallet.FromPrivateKeyWithOptions(api, w.PrivateKey(), wallet.V3R2, wallet.WithWorkchain(-1))

	//TODO: This is hardcoded for MyLocalTon pre-funded wallet
	funderWallet, err := baseFunderWallet.GetSubwallet(42)
	assert.NoError(t, err, "Failed to get subwallet: %v", err)
	t.Logf("Funder wallet address: %s", funderWallet.WalletAddress().StringRaw())

	// Check Funder Balance
	masterInfo, err := api.GetMasterchainInfo(context.Background())
	assert.NoError(t, err, "Failed to get masterchain info for funder balance check: %v", err)
	funderBalance, err := funderWallet.GetBalance(context.Background(), masterInfo)
	assert.NoError(t, err, "Failed to get funder balance: %v", err)
	t.Logf("Funder balance: %s", funderBalance.String())

	return funderWallet
}

// returns balance of the account in nanotons
func GetBalance(apiClient trace_tracking.SignedAPIClient) (*big.Int, error) {

	ctx := apiClient.Client.Client().StickyContext(context.Background())
	master, err := apiClient.Client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
	}

	// we use WaitForBlock to make sure block is ready,
	// it is optional but escapes us from liteserver block not ready errors
	res, err := apiClient.Client.WaitForBlock(master.SeqNo).GetAccount(ctx, master, apiClient.Wallet.WalletAddress())
	if err != nil {
		return nil, fmt.Errorf("get account err: %s", err.Error())
	}
	if res.IsActive {
		return res.State.Balance.Nano(), nil
	}
	return nil, fmt.Errorf("account is not active")
}

func VerifyTransaction(t *testing.T, m *trace_tracking.ReceivedMessage, initialBalance *big.Int, expectedNetTransfer *big.Int, finalBalance *big.Int) {
	expectedBalance := big.NewInt(0).Sub(trace_tracking.Sum(initialBalance, m.NetCreditResult()), trace_tracking.Sum(m.StorageFeeCharged, m.TotalTransactionExecutionFee()))
	fmt.Printf(`================
Transaction summary
────────────────────────────────────
Fees:
- - - - - - - - - - - - - - - - - - 
Storage fee      %14d
                
Gas fee	         %14d──────────────────╮
                               ╮                 │
Fwd Fees out msg %14d│      ActionFees │      TotalFees
Action fees      %14d├> %14d ├> %14d 
                               ╯                 ╯
Magic fee        %14d
────────────────────────────────────
Balance sheet:
- - - - - - - - - - - - - - - - - - 
Initial balance  %14d
Deposit amount  %14d│      NetTransactionResult
Outgoing amount %14d├> %14d
Storage fee      %14d
TotalKnownFees   %14d
Magic fee?       %14d
────────────────────────────────────
Expected balance %14d
Final balance    %14d
`,
		m.StorageFeeCharged,
		m.GasFee,
		m.MsgFeesChargedToSender,
		m.TotalActionFees,
		m.TotalActionPhaseFees(),
		big.NewInt(0).Sub(m.TotalTransactionExecutionFee(), m.MagicFee),
		m.MagicFee,
		initialBalance,
		m.Amount,
		big.NewInt(0).Neg(m.OutgoingAmount()),
		m.NetCreditResult(),
		big.NewInt(0).Neg(m.StorageFeeCharged),
		big.NewInt(0).Sub(m.MagicFee, m.TotalTransactionExecutionFee()),
		big.NewInt(0).Neg(m.MagicFee),
		expectedBalance,
		finalBalance,
	)
	assert.Equal(t, expectedBalance, finalBalance, "Expected balance does not match actual balance: %d != %d: Expected - Actual = %d", expectedBalance, finalBalance, big.NewInt(0).Sub(expectedBalance, finalBalance))
	assert.Equal(t, expectedNetTransfer, m.NetCreditResult(), "Expected transfered amount does not match actual net transaction result: %d != %d: Expected - Actual = %d", expectedNetTransfer, m.NetCreditResult(), big.NewInt(0).Sub(expectedNetTransfer, m.NetCreditResult()))
}

func MustGetBalance(t *testing.T, apiClient trace_tracking.SignedAPIClient) *big.Int {
	finalBalance, err := GetBalance(apiClient)
	assert.NoError(t, err, "Failed to get balance: %v", err)
	return finalBalance
}
