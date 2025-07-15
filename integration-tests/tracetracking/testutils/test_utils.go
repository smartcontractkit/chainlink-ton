package testutils

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"testing"

	testutils "integration-tests/utils"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	ton "github.com/xssnick/tonutils-go/ton"
	wallet "github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

func SetUpTest(t *testing.T, chainID uint64, initialAmount *big.Int, fundedAccountsCount uint) (accounts []tracetracking.SignedAPIClient) {
	api := testutils.CreateAPIClient(t, chainID)

	accounts = make([]tracetracking.SignedAPIClient, fundedAccountsCount)

	recipients := make([]*address.Address, fundedAccountsCount)
	amounts := make([]tlb.Coins, fundedAccountsCount)

	for i := range fundedAccountsCount {
		w := testutils.CreateTonWallet(t, api, wallet.V3R2, wallet.WithWorkchain(0))
		recipients[i] = w.Address()
		amounts[i] = tlb.FromNanoTON(initialAmount)

		accounts[i] = tracetracking.NewSignedAPIClient(api, *w)
	}

	testutils.FundTonWallets(t, api, recipients, amounts)

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
	t.Logf(`================
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
