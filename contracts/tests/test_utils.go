package experimentation

import (
	"context"
	"fmt"
	"math/big"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/joho/godotenv"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/stretchr/testify/assert"
	liteclient "github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	ton "github.com/xssnick/tonutils-go/ton"
	wallet "github.com/xssnick/tonutils-go/ton/wallet"
)

func setUpTest(t *testing.T, initialAmmount uint, count uint) []tonutils.ApiClient {
	// Connect to TON testnet
	client := liteclient.NewConnectionPool()
	cfg, err := liteclient.GetConfigFromUrl(context.Background(), "http://127.0.0.1:8000/localhost.global.config.json")
	if err != nil {
		t.Fatalf("Failed to get testnet config: %v", err)
	}

	err = client.AddConnectionsFromConfig(context.Background(), cfg)
	if err != nil {
		t.Fatalf("Failed to connect to TON network: %v", err)
	}

	// Initialize TON API client
	api := ton.NewAPIClient(client)

	// Get wallet for operations
	funderWallet := getWallet(t, api)

	// Run the spec tests, which are fully chain agnostic
	funder := tonutils.ApiClient{
		Api:    api,
		Wallet: *funderWallet,
	}

	initialCoinAmount := tlb.FromNanoTON(new(big.Int).SetUint64(uint64(initialAmmount)))

	accounts := make([]tonutils.ApiClient, count)
	for i := range count {
		accounts[i] = createAndFundWallet(t, api, funder, initialCoinAmount)
	}

	return accounts
}

func createAndFundWallet(t *testing.T, api *ton.APIClient, funder tonutils.ApiClient, initialCoinAmount tlb.Coins) tonutils.ApiClient {
	aliceWallet, err := tonutils.GetRandomWallet(api, wallet.V3R2, wallet.WithWorkchain(0))
	assert.NoError(t, err, "Failed to create new wallet: %v", err)
	transferToAlice, err := funder.Wallet.BuildTransfer(aliceWallet.WalletAddress(), initialCoinAmount, false, "deposit")
	assert.NoError(t, err, "Failed to build transfer: %v", err)
	result, _, err := funder.SendWaitTransactionRercursively(context.TODO(), *aliceWallet.WalletAddress(), transferToAlice)
	assert.NoError(t, err, "Failed to send transaction: %v", err)
	assert.True(t, result.Success && !result.Bounced, "Transaction failed")
	alice := tonutils.ApiClient{
		Api:    api,
		Wallet: *aliceWallet,
	}
	return alice
}

func GetWalletSeqno(apiClient tonutils.ApiClient) (uint, error) {
	return UintFrom(Get(apiClient, "seqno"))
}

func Get(apiClient tonutils.ApiClient, key string) (*ton.ExecutionResult, error) {
	block, err := apiClient.Api.CurrentMasterchainInfo(context.TODO())
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	return apiClient.Api.WaitForBlock(block.SeqNo).RunGetMethod(context.TODO(), block, apiClient.Wallet.WalletAddress(), key)
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

// TODO abstract repeated code
func getWallet(t *testing.T, api ton.APIClientWrapped) *wallet.Wallet {
	// Load .env file from the project root
	err := godotenv.Load(".env")
	if err != nil {
		// It's okay if the .env file doesn't exist in some environments
		// so we'll just log it instead of failing
		t.Logf("Warning: Error loading .env file: %v", err)
	}
	// Get seed phrase from environment variable
	seedPhrase := os.Getenv("SIGNER_WALLET_SEED_PHRASE")
	if seedPhrase == "" {
		t.Fatalf("Environment variable SIGNER_WALLET_SEED_PHRASE not set or empty")
	}
	words := strings.Fields(seedPhrase)

	// Create wallet from seed with password
	w, err := wallet.FromSeed(api, words, wallet.V3R2)
	if err != nil {
		t.Fatalf("Failed to create wallet from seed: %v", err)
	}
	baseFunderWallet, err := wallet.FromPrivateKeyWithOptions(api, w.PrivateKey(), wallet.V3R2, wallet.WithWorkchain(-1))

	//TODO: This is hardcoded for MyLocalTon pre-funded wallet
	funderWallet, err := baseFunderWallet.GetSubwallet(42)
	t.Logf("Funder wallet address: %s", funderWallet.WalletAddress().StringRaw())

	// Check Funder Balance
	masterInfo, err := api.GetMasterchainInfo(context.Background())
	funderBalance, err := funderWallet.GetBalance(context.Background(), masterInfo)
	t.Logf("Funder balance: %s", funderBalance.String())

	return funderWallet
}

// returns balance of the account in nanotons
func GetBalance(apiClient tonutils.ApiClient) (uint, error) {
	ctx := apiClient.Api.Client().StickyContext(context.Background())
	master, err := apiClient.Api.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
	}
	return GetBalanceSeqno(apiClient, master.SeqNo)
}

func GetBalanceSeqno(apiClient tonutils.ApiClient, seqno uint32) (uint, error) {
	fmt.Printf("Getting balance for seqno: %d\n", seqno)
	ctx := apiClient.Api.Client().StickyContext(context.Background())
	master, err := apiClient.Api.WaitForBlock(seqno).CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
	}
	fmt.Printf("Masterchain SeqNo: %d\n", master.SeqNo)

	for {
		// Check if the block is ready
		if master.SeqNo > seqno {
			break
		}
		time.Sleep(time.Millisecond * 500)
		fmt.Printf("Waiting for block %d to be ready...\n", seqno)
		master, err = apiClient.Api.WaitForBlock(seqno).CurrentMasterchainInfo(ctx)
		if err != nil {
			return 0, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
		}
		fmt.Printf("Masterchain SeqNo: %d\n", master.SeqNo)
	}

	// time.Sleep(time.Second * 5)

	// master, err = apiClient.Api.CurrentMasterchainInfo(ctx)
	// if err != nil {
	// 	return 0, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
	// }
	// fmt.Printf("Masterchain SeqNo: %d\n", master.SeqNo)
	// panic("(this is a test)")

	// we use WaitForBlock to make sure block is ready,
	// it is optional but escapes us from liteserver block not ready errors
	res, err := apiClient.Api.WaitForBlock(seqno).GetAccount(ctx, master, apiClient.Wallet.WalletAddress())
	if err != nil {
		return 0, fmt.Errorf("get account err: %s", err.Error())
	}
	if res.IsActive {
		return uint(res.State.Balance.Nano().Uint64()), nil
	}
	return 0, fmt.Errorf("account is not active")
}

func verifyTransaction(t *testing.T, m *tonutils.MessageReceived, initialBalance uint, expectedNetTransfer int, finalBalance uint) {
	expectedBalance := uint(int(initialBalance) + m.NetCreditResult() - int(m.StorageFeeCharged+m.TotalTransactionExecutionFee()))
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
Deposit ammount  %14d│      NetTransactionResult
Outgoing ammount %14d├> %14d
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
		m.TotalTransactionExecutionFee()-m.MagicFee,
		m.MagicFee,
		initialBalance,
		m.Amount,
		-int(m.OutgoingAmount()),
		m.NetCreditResult(),
		-int(m.StorageFeeCharged),
		-int(m.TotalTransactionExecutionFee()-m.MagicFee),
		-int(m.MagicFee),
		expectedBalance,
		finalBalance,
	)
	assert.Equal(t, expectedBalance, finalBalance, "Expected balance does not match actual balance: %d != %d: Expected - Actual = %d", expectedBalance, finalBalance, int(expectedBalance)-int(finalBalance))
	assert.Equal(t, expectedNetTransfer, m.NetCreditResult(), "Expected transfered amount does not match actual net transaction result: %d != %d: Expected - Actual = %d", expectedNetTransfer, m.NetCreditResult(), expectedNetTransfer-m.NetCreditResult())
}

func MustGetBalance(t *testing.T, apiClient tonutils.ApiClient) uint {
	finalBalance, err := GetBalance(apiClient)
	assert.NoError(t, err, "Failed to get balance: %v", err)
	return finalBalance
}

func Logf(fmts string, args ...any) {
	// print in green color
	fmt.Printf("\n\033[32m"+fmts+"\033[0m\n", args...)
}
