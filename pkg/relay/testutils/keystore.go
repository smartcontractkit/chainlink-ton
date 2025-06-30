package testutils

import (
	"context"
	"crypto/ed25519"
	"testing"

	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/key"
)

type TestKeystore struct {
	t    *testing.T
	Keys map[string]ed25519.PrivateKey
}

var _ loop.Keystore = &TestKeystore{}

func NewTestKeystore(t *testing.T) *TestKeystore {
	return &TestKeystore{t: t, Keys: map[string]ed25519.PrivateKey{}}
}

func (tk *TestKeystore) AddKey(privateKey ed25519.PrivateKey) {
	pubKey := privateKey.Public()
	pubKeyHex, err := key.PublicKeyHex(pubKey)
	if err != nil {
		tk.t.Fatalf("failed to convert public key to hex: %s", err)
	}

	if _, ok := tk.Keys[pubKeyHex]; ok {
		tk.t.Fatalf("Key already exists: %s", pubKeyHex)
	}
	tk.Keys[pubKeyHex] = privateKey
}

func (tk *TestKeystore) Sign(ctx context.Context, id string, hash []byte) ([]byte, error) {
	privateKey, ok := tk.Keys[id]
	if !ok {
		tk.t.Fatalf("No such key: %s", id)
	}

	// used to check if the account exists.
	if hash == nil {
		return nil, nil
	}

	return ed25519.Sign(privateKey, hash), nil
}

func (tk *TestKeystore) Accounts(ctx context.Context) ([]string, error) {
	accounts := make([]string, 0, len(tk.Keys))
	for id := range tk.Keys {
		accounts = append(accounts, id)
	}
	return accounts, nil
}
