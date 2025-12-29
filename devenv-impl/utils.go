package ccip_ton

import (
	"crypto/ed25519"
	"encoding/hex"
	"fmt"

	"github.com/smartcontractkit/chainlink-testing-framework/framework/clclient"
	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

func GetNodeAddressFromBundle(bundle *clclient.NodeKeysBundle) (string, error) {
	k, err := hex.DecodeString(bundle.TXKey.Data.Attributes.PublicKey)
	if err != nil {
		return "", fmt.Errorf("failed to decode public key: %w", err)
	}
	walletAddr, err := wallet.AddressFromPubKey(
		ed25519.PublicKey(k),
		tonconfig.WalletVersion,
		wallet.DefaultSubwallet,
		0,
	)
	if err != nil {
		return "", fmt.Errorf("failed to get wallet address from public key: %w", err)
	}
	addr := walletAddr.String()
	return addr, nil
}
