package key

import (
	"crypto"
	"crypto/ed25519"
	"encoding/hex"
	"fmt"
)

func PublicKeyHex(pubKey crypto.PublicKey) (string, error) {
	edKey, ok := pubKey.(ed25519.PublicKey)
	if !ok {
		return "", fmt.Errorf("unsupported key type: %T", pubKey)
	}
	return hex.EncodeToString(edKey), nil
}
