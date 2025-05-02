package testutils

import (
	"context"
	"encoding/base64"
	"fmt"
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

func ConnectLocalnet(t *testing.T) *ton.APIClient {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	wnerr := waitForNode(ctx, config.NetworkConfigFile, config.LiteClient)
	require.NoError(t, wnerr, "Failed to connect to mylocalton instance")

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
	Start             time.Time
	InitialDelay      time.Duration
	RemainingAttempts uint
	Timeout           time.Duration
	Timestep          time.Duration
}

func (o waitAndRetryOpts) WithDecreasedAttempts() waitAndRetryOpts {
	return waitAndRetryOpts{
		Start:             o.Start,
		InitialDelay:      o.InitialDelay,
		RemainingAttempts: o.RemainingAttempts - 1,
		Timeout:           o.Timeout,
		Timestep:          o.Timestep,
	}
}

func FundAccounts(ctx context.Context, accounts []FundRecipient, client *ton.APIClient, t *testing.T) error {
	return fundAccounts(ctx, accounts, client, t, waitAndRetryOpts{
		Start:             time.Now(),
		InitialDelay:      10 * time.Second, // silence account not ready
		RemainingAttempts: 50,
		Timeout:           60 * time.Second,
		Timestep:          2 * time.Second,
	})
}

func fundAccounts(ctx context.Context, accounts []FundRecipient, client *ton.APIClient, t *testing.T, opts waitAndRetryOpts) error {
	start := time.Now()
	total := len(accounts)
	batchSize := config.FaucetBatchSize
	batches := (total + batchSize - 1) / batchSize

	t.Logf("funding %d accounts in %d batches (batch size %d)…", total, batches, batchSize)

	funder := getPrefundedHlWallet(client, t)
	master, merr := client.GetMasterchainInfo(ctx)
	require.NoError(t, merr, "failed to get masterchain info for funder balance check")
	funderBalance, fberr := funder.GetBalance(ctx, master)
	require.NoError(t, fberr, "failed to get funder balance")

	totalAmount := new(big.Int)
	for _, recipient := range accounts {
		totalAmount.Add(totalAmount, recipient.Amount.Nano())
	}
	// totalAmount + 0.01 TON gas buffer
	requiredBalance := new(big.Int).Add(totalAmount, tlb.MustFromTON("0.01").Nano())

	if funderBalance.Nano().Cmp(requiredBalance) < 0 {
		return fmt.Errorf("insufficient balance (%s TON) to send %s TON", funderBalance.String(), requiredBalance.String())
	}

	for b, i := 0, 0; i < total; b, i = b+1, i+batchSize {
		end := i + batchSize
		if end > total {
			end = total
		}
		batch := accounts[i:end]

		// build and send
		t.Logf("batch %d/%d: sending %d transfers", b+1, batches, len(batch))
		msgs := make([]*wallet.Message, len(batch))
		for j, r := range batch {
			m, err := funder.BuildTransfer(r.Address, *r.Amount, false, "")
			if err != nil {
				return fmt.Errorf("batch %d build transfer: %w", b+1, err)
			}
			msgs[j] = m
		}
		tx, block, err := funder.SendManyWaitTransaction(ctx, msgs)
		if err != nil {
			return fmt.Errorf("batch %d send: %w", b+1, err)
		}
		t.Logf("batch %d/%d: sent tx %s at block %d", b+1, batches, base64.StdEncoding.EncodeToString(tx.Hash), block.SeqNo)

		// wait for the whole batch
		t.Logf("batch %d/%d: waiting confirmation for %d accounts", b+1, batches, len(batch))
		for _, r := range batch {
			if err := waitForBalance(ctx, r, opts, client, t); err != nil {
				return fmt.Errorf("batch %d confirm %s: %w",
					b+1, r.Address.String(), err)
			}
		}
		t.Logf("batch %d/%d: all %d confirmed", b+1, batches, len(batch))
	}

	elapsed := time.Since(start).Truncate(time.Millisecond)
	avgMs := float64(elapsed.Milliseconds()) / float64(total)
	t.Logf("funded %d accounts in %s (avg %.1fms/account)", total, elapsed, avgMs)

	return nil
}

func getPrefundedHlWallet(client *ton.APIClient, t *testing.T) *wallet.Wallet {
	// NOTE: This funder high-load wallet is from MyLocalTon pre-funded wallet
	// ref: https://github.com/neodix42/mylocalton-docker#features
	rawHlWallet, hlerr := wallet.FromSeed(client, strings.Fields(config.FaucetHlWalletSeed), config.FaucetHlWalletVer)
	require.NoError(t, hlerr, "failed to create highload wallet")
	mcFunderWallet, mferr := wallet.FromPrivateKeyWithOptions(client, rawHlWallet.PrivateKey(), config.FaucetHlWalletVer, wallet.WithWorkchain(-1))
	require.NoError(t, mferr, "failed to create highload wallet")
	hlfunder, fserr := mcFunderWallet.GetSubwallet(config.FaucetHlWalletSubwalletID)
	require.NoError(t, fserr, "failed to get highload subwallet")
	require.Equal(t, hlfunder.Address().StringRaw(), config.FaucetHlWalletAddress, "funder address mismatch")
	return hlfunder
}

func waitForBalance(ctx context.Context, recipient FundRecipient, opts waitAndRetryOpts, client *ton.APIClient, t *testing.T) error {
	if opts.RemainingAttempts == 0 {
		return fmt.Errorf("timeout waiting for address %s to receive %s TON",
			recipient.Address.String(), recipient.Amount.String())
	}

	masterInfo, err := client.GetMasterchainInfo(ctx)
	if err != nil {
		t.Log("Warning: failed to get masterchain info: ", err)
		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled while waiting for balance")
		case <-time.After(opts.Timestep):
			return waitForBalance(ctx, recipient, opts.WithDecreasedAttempts(), client, t)
		}
	}

	acc, err := client.GetAccount(ctx, masterInfo, recipient.Address)
	if err != nil || acc == nil || acc.State == nil || !acc.IsActive {
		// only start logging this after InitialDelay
		if time.Since(opts.Start) >= opts.InitialDelay {
			t.Logf("account not ready: %v", err)
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled while waiting for balance")
		case <-time.After(opts.Timestep):
			return waitForBalance(ctx, recipient, opts.WithDecreasedAttempts(), client, t)
		}
	}

	balance := acc.State.Balance
	if balance.Compare(recipient.Amount) >= 0 {
		// t.Logf("%sSuccess: Balance for %s reached: %s TON\n",
		// 	logPrefix, recipient.Address.String(), balance.String())
		return nil
	}

	t.Logf("Waiting for %s... Current: %s TON, Target: %s TON\n",
		recipient.Address.String(), balance.String(), recipient.Amount.String())

	select {
	case <-ctx.Done():
		return fmt.Errorf("context cancelled while waiting for balance")
	case <-time.After(opts.Timestep):
		return waitForBalance(ctx, recipient, opts.WithDecreasedAttempts(), client, t)
	}
}
