package utils

import (
	"testing"

	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

// TODO: this is a temporary placeholder for linter setup, remove once we have tonutils package
func GetRandomWallet(t *testing.T, client ton.APIClientWrapped, version wallet.Version, option wallet.Option) *wallet.Wallet {
	seed := wallet.NewSeed()
	w, err := wallet.FromSeed(client, seed, version)
	if err != nil {
		t.Fatalf("Failed to generate random wallet: %w", err)
	}
	pw, perr := wallet.FromPrivateKeyWithOptions(client, w.PrivateKey(), version, option)
	if perr != nil {
		t.Fatalf("Failed to generate random wallet: %v", perr)
	}
	return pw
}
