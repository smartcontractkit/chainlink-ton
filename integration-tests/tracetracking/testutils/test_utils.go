package testutils

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"os"
	"path"
	"strings"
	"testing"

	testutils "integration-tests/utils"

	"github.com/joho/godotenv"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/tlb"
	ton "github.com/xssnick/tonutils-go/ton"
	wallet "github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

func SetUpTest(t *testing.T, chainID uint64, initialAmount *big.Int, fundedAccountsCount uint) (accounts []tracetracking.SignedAPIClient) {
	api := testutils.CreateAPIClient(t, chainID, false)

	// Get wallet for operations
	funderWallet := getWallet(t, api)

	// Run the spec tests, which are fully chain agnostic
	funder := tracetracking.NewSignedAPIClient(api, *funderWallet)

	initialCoinAmount := tlb.FromNanoTON(initialAmount)

	accounts = make([]tracetracking.SignedAPIClient, fundedAccountsCount)
	for i := range fundedAccountsCount {
		accounts[i] = createAndFundWallet(t, api, funder, initialCoinAmount)
	}

	return accounts
}

func GetRandomWallet(client ton.APIClientWrapped, version wallet.Version, option wallet.Option) (*wallet.Wallet, error) {
	seed := wallet.NewSeed()
	w, err := wallet.FromSeed(client, seed, version)
	if err != nil {
		return nil, fmt.Errorf("failed to generate random wallet: %w", err)
	}
	pw, perr := wallet.FromPrivateKeyWithOptions(client, w.PrivateKey(), version, option)
	if perr != nil {
		return nil, fmt.Errorf("failed to generate random wallet: %w", perr)
	}
	return pw, nil
}

func createAndFundWallet(t *testing.T, api *ton.APIClient, funder tracetracking.SignedAPIClient, initialCoinAmount tlb.Coins) tracetracking.SignedAPIClient {
	aliceWallet, err := GetRandomWallet(api, wallet.V3R2, wallet.WithWorkchain(0))
	require.NoError(t, err, "failed to create new wallet: %w", err)
	transferToAlice, err := funder.Wallet.BuildTransfer(aliceWallet.WalletAddress(), initialCoinAmount, false, "deposit")
	require.NoError(t, err, "failed to build transfer: %w", err)
	result, err := funder.SendAndWaitForTrace(context.TODO(), *aliceWallet.WalletAddress(), transferToAlice)
	require.NoError(t, err, "failed to send transaction: %w", err)
	require.True(t, result.Success && !result.Bounced, "Transaction failed")
	alice := tracetracking.NewSignedAPIClient(api, *aliceWallet)
	return alice
}

func GetWalletSeqno(apiClient tracetracking.SignedAPIClient) (uint, error) {
	return UintFrom(Get(apiClient, "seqno"))
}

func Get(apiClient tracetracking.SignedAPIClient, key string) (*ton.ExecutionResult, error) {
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

	return uint(val.Int64()), nil //nolint:gosec // test purpose
}

func getWallet(t *testing.T, api ton.APIClientWrapped) *wallet.Wallet {
	// Load .env file from the project root
	repoRoot := testutils.GetRepoRootDir()
	err := godotenv.Load(path.Join(repoRoot, "integration-tests/tracetracking/.env"))
	if err != nil {
		// It's okay if the .env file doesn't exist in some environments
		// so we'll just log it instead of failing
		t.Logf("Warning: Error loading .env file: %s", err)
	}
	// Get seed phrase from environment variable
	seedPhrase := os.Getenv("SIGNER_WALLET_SEED_PHRASE")
	require.NotEmpty(t, seedPhrase, "Environment variable SIGNER_WALLET_SEED_PHRASE not set or empty")

	words := strings.Fields(seedPhrase)

	// Create wallet from seed with password
	w, err := wallet.FromSeed(api, words, wallet.V3R2)
	require.NoError(t, err, "failed to create wallet from seed: %w", err)

	baseFunderWallet, err := wallet.FromPrivateKeyWithOptions(api, w.PrivateKey(), wallet.V3R2, wallet.WithWorkchain(-1))
	require.NoError(t, err, "failed to create base funder wallet: %w", err)

	//TODO: This is hardcoded for MyLocalTon pre-funded wallet
	funderWallet, err := baseFunderWallet.GetSubwallet(42)
	require.NoError(t, err, "failed to get subwallet: %w", err)
	t.Logf("Funder wallet address: %s", funderWallet.WalletAddress().StringRaw())

	// Check Funder Balance
	masterInfo, err := api.GetMasterchainInfo(context.Background())
	require.NoError(t, err, "failed to get masterchain info for funder balance check: %w", err)
	funderBalance, err := funderWallet.GetBalance(context.Background(), masterInfo)
	require.NoError(t, err, "failed to get funder balance: %w", err)
	t.Logf("Funder balance: %s", funderBalance.String())

	return funderWallet
}

// returns balance of the account in nanotons
func GetBalance(apiClient tracetracking.SignedAPIClient) (*big.Int, error) {
	ctx := apiClient.Client.Client().StickyContext(context.Background())
	master, err := apiClient.Client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
	}

	// we use WaitForBlock to make sure block is ready,
	// it is optional but escapes us from liteserver block not ready errors
	res, err := apiClient.Client.WaitForBlock(master.SeqNo).GetAccount(ctx, master, apiClient.Wallet.WalletAddress())
	if err != nil {
		return nil, fmt.Errorf("get account err: %w", err)
	}
	if res.IsActive {
		return res.State.Balance.Nano(), nil
	}
	return nil, errors.New("account is not active")
}

func VerifyTransaction(t *testing.T, m *tracetracking.ReceivedMessage, initialBalance *big.Int, expectedNetTransfer *big.Int, finalBalance *big.Int) {
	expectedBalance := big.NewInt(0).Sub(tracetracking.Sum(initialBalance, m.NetCreditResult()), tracetracking.Sum(m.StorageFeeCharged, m.TotalTransactionExecutionFee()))
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
	require.Equal(t, expectedBalance, finalBalance, "Expected balance does not match actual balance: %d != %d: Expected - Actual = %d", expectedBalance, finalBalance, big.NewInt(0).Sub(expectedBalance, finalBalance))
	require.Equal(t, expectedNetTransfer, m.NetCreditResult(), "Expected transferred amount does not match actual net transaction result: %d != %d: Expected - Actual = %d", expectedNetTransfer, m.NetCreditResult(), big.NewInt(0).Sub(expectedNetTransfer, m.NetCreditResult()))
}

func MustGetBalance(t *testing.T, apiClient tracetracking.SignedAPIClient) *big.Int {
	finalBalance, err := GetBalance(apiClient)
	require.NoError(t, err, "failed to get balance: %w", err)
	return finalBalance
}
