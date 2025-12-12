package tvm

import "github.com/xssnick/tonutils-go/ton/wallet"

// NewRandomTestWallet creates a new random wallet for testing purposes.
func NewRandomTestWallet(api wallet.TonAPI, networkGlobalID int32) (*wallet.Wallet, error) {
	v5r1Config := wallet.ConfigV5R1Final{
		NetworkGlobalID: networkGlobalID,
		Workchain:       0,
	}

	return wallet.FromSeed(api, wallet.NewSeed(), v5r1Config)
}
