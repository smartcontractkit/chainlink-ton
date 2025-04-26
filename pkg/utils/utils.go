package utils

import (
	"fmt"

	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

func GetRandomWallet(client ton.APIClientWrapped, version wallet.Version, option wallet.Option) (*wallet.Wallet, error) {
	seed := wallet.NewSeed()
	w, err := wallet.FromSeed(client, seed, version)
	if err != nil {
		return nil, fmt.Errorf("Failed to generate random wallet: %v", err)
	}
	pw, perr := wallet.FromPrivateKeyWithOptions(client, w.PrivateKey(), wallet.V3R2, option)
	if perr != nil {
		return nil, fmt.Errorf("Failed to generate random wallet: %v", perr)
	}
	return pw, nil
}
