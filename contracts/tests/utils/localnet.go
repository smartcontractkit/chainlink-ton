package utils

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/contracts/tests/config"
)

func ConnetLocalnet(t *testing.T) *ton.APIClient {
	// todo: do we want to spin up a localnet node from go tests or manage as a separated service?
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	wnerr := waitForNode(ctx, config.NetworkConfigFile, config.LiteClient)
	require.NoError(t, wnerr, "Failed to wait for localnet node")

	connectionPool := liteclient.NewConnectionPool()

	cfg, cferr := liteclient.GetConfigFromUrl(context.Background(), config.NetworkConfigFile)
	require.NoError(t, cferr, "Failed to get config from URL")

	caerr := connectionPool.AddConnectionsFromConfig(context.Background(), cfg)
	require.NoError(t, caerr, "Failed to add connections from config")

	client := ton.NewAPIClient(connectionPool)
	return client
}

func waitForNode(ctx context.Context, httpURL, liteAddr string) error {
	client := &http.Client{Timeout: 1 * time.Second}
	tick := time.NewTicker(1 * time.Second)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-tick.C:
			// 1) HTTP check
			resp, err := client.Head(httpURL)
			if err != nil || resp.StatusCode < 200 || resp.StatusCode >= 300 {
				continue
			}
			resp.Body.Close()

			// 2) TCP check
			conn, err := net.DialTimeout("tcp", liteAddr, 1*time.Second)
			if err != nil {
				continue
			}
			conn.Close()

			// both passed
			return nil
		}
	}
}

type FundRecipient struct {
	Address *address.Address
	Amount  *tlb.Coins
}

type waitAndRetryOpts struct {
	RemainingAttempts uint
	Timeout           time.Duration
	Timestep          time.Duration
}

func (o waitAndRetryOpts) WithDecreasedAttempts() waitAndRetryOpts {
	return waitAndRetryOpts{
		RemainingAttempts: o.RemainingAttempts - 1,
		Timeout:           o.Timeout,
		Timestep:          o.Timestep,
	}
}

func FundAccounts(ctx context.Context, accounts []FundRecipient, tonGoClient *ton.APIClient, t *testing.T) error {
	return fundAccounts(ctx, accounts, tonGoClient, t, waitAndRetryOpts{
		RemainingAttempts: 50,
		Timeout:           60 * time.Second,
		Timestep:          2 * time.Second,
	})
}

func fundAccounts(ctx context.Context, accounts []FundRecipient, tonGoClient *ton.APIClient, t *testing.T, opts waitAndRetryOpts) error {
	log.Printf("Funding %d accounts", len(accounts))
	require.LessOrEqual(t, len(accounts), 4, "Airdrop with normal wallet supports up to 4 accounts")

	funder := getPrefundedWallet(tonGoClient, t)

	totalAmount := new(big.Int)
	for _, recipient := range accounts {
		totalAmount.Add(totalAmount, recipient.Amount.Nano())
	}

	master, merr := tonGoClient.GetMasterchainInfo(ctx)
	require.NoError(t, merr, "failed to get masterchain info for funder balance check")
	funderBalance, fberr := funder.GetBalance(ctx, master)
	require.NoError(t, fberr, "failed to get funder balance")

	// totalAmount + 0.01 TON gas buffer
	requiredBalance := new(big.Int).Add(totalAmount, tlb.MustFromTON("0.01").Nano())

	if funderBalance.Nano().Cmp(requiredBalance) < 0 {
		return fmt.Errorf("prefunded wallet has insufficient balance (%s TON) to send %s TON", funderBalance.String(), requiredBalance.String())
	}

	// Send multiple messages in one transaction
	amountToncoin, aterr := tlb.FromNano(requiredBalance, 9) // Convert tlb.Coins value to tlb.Toncoin
	require.NoError(t, aterr, "failed to convert amount to Toncoin")

	batchSize := 4
	for i := 0; i < len(accounts); i += batchSize {
		end := i + batchSize
		if end > len(accounts) {
			end = len(accounts)
		}

		batchMessages := make([]*wallet.Message, end-i)
		for j := i; j < end; j++ {
			// Build transfer for each recipient in this batch
			transfer, terr := funder.BuildTransfer(accounts[j].Address, amountToncoin, false, "")
			require.NoError(t, terr, fmt.Sprintf("failed to build transfer for %s", accounts[j].Address.String()))
			batchMessages[j-i] = transfer
		}

		tx, block, txerr := funder.SendManyWaitTransaction(ctx, batchMessages)
		require.NoError(t, txerr, "airdrop transaction failed")

		log.Printf("Airdrop transaction sent: %s in block %d", base64.StdEncoding.EncodeToString(tx.Hash), block.SeqNo)
	}

	// Wait for all recipients to receive the funds
	for _, recipient := range accounts {

		// Wait for balance using our helper function
		if err := waitForBalance(ctx, tonGoClient, recipient, opts); err != nil {
			return err
		}

		log.Printf("Airdrop confirmed for %s", recipient.Address.String())
	}

	return nil
}

func getPrefundedWallet(tonGoClient *ton.APIClient, t *testing.T) *wallet.Wallet {
	// NOTE: This funder wallet is from MyLocalTon pre-funded wallet
	// ref: https://github.com/neodix42/mylocalton-docker#features
	rawFunderWallet, rferr := wallet.FromSeed(tonGoClient, strings.Fields(config.FunderWalletSeed), config.FunderWalletVer)
	require.NoError(t, rferr)
	mcFunderWallet, mferr := wallet.FromPrivateKeyWithOptions(tonGoClient, rawFunderWallet.PrivateKey(), wallet.V3R2, wallet.WithWorkchain(-1))
	require.NoError(t, mferr)
	funder, fserr := mcFunderWallet.GetSubwallet(uint32(config.FunderSubWalletID))
	require.NoError(t, fserr)
	return funder
}

func waitForBalance(ctx context.Context, tonGoClient *ton.APIClient,
	recipient FundRecipient, opts waitAndRetryOpts) error {
	logPrefix := fmt.Sprintf("[Balance Wait %s] ", recipient.Address.String()[:10])

	if opts.RemainingAttempts == 0 {
		return fmt.Errorf("%stimeout waiting for address %s to receive %s TON",
			logPrefix, recipient.Address.String(), recipient.Amount.String())
	}

	// Get current balance
	masterInfo, err := tonGoClient.GetMasterchainInfo(ctx)
	if err != nil {
		log.Printf("%sWarning: failed to get masterchain info: %v\n", logPrefix, err)
		select {
		case <-ctx.Done():
			return fmt.Errorf("%scontext cancelled while waiting for balance", logPrefix)
		case <-time.After(opts.Timestep):
			return waitForBalance(ctx, tonGoClient, recipient, opts.WithDecreasedAttempts())
		}
	}

	acc, err := tonGoClient.GetAccount(ctx, masterInfo, recipient.Address)
	if err != nil || acc == nil || acc.State == nil || !acc.IsActive {
		log.Printf("%sAccount not ready yet: %v\n", logPrefix, err)
		select {
		case <-ctx.Done():
			return fmt.Errorf("%scontext cancelled while waiting for balance", logPrefix)
		case <-time.After(opts.Timestep):
			return waitForBalance(ctx, tonGoClient, recipient, opts.WithDecreasedAttempts())
		}
	}

	balance := acc.State.Balance
	if balance.Compare(recipient.Amount) >= 0 {
		log.Printf("%sSuccess: Balance for %s reached: %s TON\n",
			logPrefix, recipient.Address.String(), balance.String())
		return nil
	}

	log.Printf("%sWaiting for %s... Current: %s TON, Target: %s TON\n",
		logPrefix, recipient.Address.String(), balance.String(), recipient.Amount.String())

	select {
	case <-ctx.Done():
		return fmt.Errorf("%scontext cancelled while waiting for balance", logPrefix)
	case <-time.After(opts.Timestep):
		return waitForBalance(ctx, tonGoClient, recipient, opts.WithDecreasedAttempts())
	}
}
