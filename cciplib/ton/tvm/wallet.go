package tvm

import (
	"context"
	"crypto/ed25519"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

// NOTE: Prefunded high-load wallet from MyLocalTon pre-funded wallet, that can send up to 254 messages per 1 external message
// https://docs.ton.org/v3/documentation/smart-contracts/contracts-specs/highload-wallet#highload-wallet-v2
const DefaultTonHlWalletAddress = "-1:5ee77ced0b7ae6ef88ab3f4350d8872c64667ffbe76073455215d3cdfab3294b"
const DefaultTonHlWalletMnemonic = "twenty unfair stay entry during please water april fabric morning length lumber style tomorrow melody similar forum width ride render void rather custom coin"

func NewRandomTestWallet(client ton.APIClientWrapped, version wallet.VersionConfig, option wallet.Option) (*wallet.Wallet, error) {
	seed := wallet.NewSeed()
	rw, err := wallet.FromSeed(client, seed, version)
	if err != nil {
		return nil, fmt.Errorf("failed to generate random wallet: %w", err)
	}
	pw, perr := wallet.FromPrivateKeyWithOptions(client, rw.PrivateKey(), version, option)
	if perr != nil {
		return nil, fmt.Errorf("failed to generate random wallet: %w", perr)
	}
	return pw, nil
}

// NewRandomV5R1TestWallet creates a new random wallet for testing purposes.
func NewRandomV5R1TestWallet(api wallet.TonAPI, networkGlobalID int32) (*wallet.Wallet, error) {
	v5r1Config := wallet.ConfigV5R1Final{
		NetworkGlobalID: networkGlobalID,
		Workchain:       0,
	}

	return wallet.FromSeed(api, wallet.NewSeed(), v5r1Config)
}

// NewV5R1Wallet creates a new V5R1 wallet by using the provided private key.
func NewV5R1Wallet(api wallet.TonAPI, networkGlobalID int32, privateKey ed25519.PrivateKey) (*wallet.Wallet, error) {
	v5r1Config := wallet.ConfigV5R1Final{
		NetworkGlobalID: networkGlobalID,
		Workchain:       0,
	}

	return wallet.FromPrivateKey(api, privateKey, v5r1Config)
}

func NewRandomHighloadV3TestWallet(client ton.APIClientWrapped) (*wallet.Wallet, error) {
	seed := wallet.NewSeed()
	w, err := wallet.FromSeed(client, seed, wallet.ConfigHighloadV3{
		MessageTTL: 60 * 5,
		MessageBuilder: func(ctx context.Context, subWalletId uint32) (id uint32, createdAt int64, err error) {
			// Due to specific of externals emulation on liteserver,
			// we need to take something less than or equals to block time, as message creation time,
			// otherwise external message will be rejected, because time will be > than emulation time
			// hope it will be fixed in the next LS versions
			createdAt = time.Now().Unix() - 30

			// example query id which will allow you to send 1 tx per second
			// but you better to implement your own iterator in database, then you can send unlimited
			// but make sure id is less than 1 << 23, when it is higher start from 0 again
			return uint32(createdAt % (1 << 23)), createdAt, nil //nolint:gosec // test wallet
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate random wallet: %w", err)
	}
	return w, nil
}

// NOTE: Prefunded high-load wallet from MyLocalTon pre-funded wallet, that can send up to 254 messages per 1 external message
// https://docs.ton.org/v3/documentation/smart-contracts/contracts-specs/highload-wallet#highload-wallet-v2
func MyLocalTONWalletDefault(client ton.APIClientWrapped) (*wallet.Wallet, error) {
	walletVersion := wallet.HighloadV2Verified //nolint:staticcheck // only option in mylocalton-docker
	rawHlWallet, err := wallet.FromSeed(client, strings.Fields(DefaultTonHlWalletMnemonic), walletVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to create highload wallet: %w", err)
	}
	mcFunderWallet, err := wallet.FromPrivateKeyWithOptions(client, rawHlWallet.PrivateKey(), walletVersion, wallet.WithWorkchain(int8(address.MasterchainID)))
	if err != nil {
		return nil, fmt.Errorf("failed to create highload wallet: %w", err)
	}
	subWalletID := uint32(42)
	funder, err := mcFunderWallet.GetSubwallet(subWalletID)
	if err != nil {
		return nil, fmt.Errorf("failed to get highload subwallet: %w", err)
	}
	// confirm the funder address
	if funder.Address().StringRaw() != DefaultTonHlWalletAddress {
		return nil, errors.New("funder address mismatch")
	}
	return funder, nil
}

// NewInitializedWallet creates and deploys a new wallet by first funding it from funder and then sending a self-transfer
// internal message with a non-zero amount to trigger the wallet's state initialization.
func NewInitializedWallet(ctx context.Context, funder *wallet.Wallet, w *wallet.Wallet, amount tlb.Coins) error {
	// Fund wallet
	_, _, err := funder.SendWaitTransaction(ctx,
		&wallet.Message{
			Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      false,
				DstAddr:     w.WalletAddress(),
				Amount:      amount,
				Body:        nil,
			},
		})
	if err != nil {
		return fmt.Errorf("failed to fund wallet: %w", err)
	}

	// Init wallet
	_, _, err = w.SendWaitTransaction(ctx,
		&wallet.Message{
			Mode: wallet.PayGasSeparately,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      false,
				DstAddr:     w.WalletAddress(),
				Amount:      *amount.MustDiv(big.NewInt(2)), // Send some non-zero amount to self to trigger wallet initialization
				Body:        nil,
			},
		})
	if err != nil {
		return fmt.Errorf("failed to initialize wallet: %w", err)
	}

	return nil
}
