package monitor

import (
	"crypto/ed25519"
	"encoding/hex"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
)

func TestDecodeHexPublicKey(t *testing.T) {
	t.Run("ValidPublicKey", func(t *testing.T) {
		testPrivateKey := ed25519.PrivateKey{
			0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
			0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
			0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
			0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
			// Public key portion
			0x4d, 0x8e, 0x0a, 0x17, 0x9e, 0x62, 0x62, 0x06,
			0x8f, 0x0a, 0x6f, 0xa9, 0xf7, 0xe6, 0x3e, 0x3a,
			0x4b, 0xaa, 0x7b, 0xe5, 0x2c, 0x68, 0x7f, 0x8e,
			0xe5, 0xb9, 0xa7, 0x3e, 0x02, 0x66, 0x0e, 0x9a,
		}

		// Extract and convert the public key
		expectedPubKey := testPrivateKey.Public().(ed25519.PublicKey)
		hexPubKey := hex.EncodeToString(expectedPubKey)

		// Test the decoding
		pubKey, err := DecodeHexPublicKey(hexPubKey)
		require.NoError(t, err)
		require.NotNil(t, pubKey)
		require.Equal(t, expectedPubKey, pubKey, "Decoded public key should match the expected key")
	})

	t.Run("InvalidHexString", func(t *testing.T) {
		_, err := DecodeHexPublicKey("not-valid-hex")
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid hex-encoded public key")
	})

	t.Run("InvalidKeySize", func(t *testing.T) {
		shortHex := "00112233" // Only 4 bytes, not 32
		_, err := DecodeHexPublicKey(shortHex)
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid public key size")
	})
}

func TestHexPublicKeyToWalletAddress(t *testing.T) {
	t.Run("ValidPublicKey", func(t *testing.T) {
		testPrivateKey := ed25519.PrivateKey{
			0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
			0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
			0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
			0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
			// Public key portion
			0x4d, 0x8e, 0x0a, 0x17, 0x9e, 0x62, 0x62, 0x06,
			0x8f, 0x0a, 0x6f, 0xa9, 0xf7, 0xe6, 0x3e, 0x3a,
			0x4b, 0xaa, 0x7b, 0xe5, 0x2c, 0x68, 0x7f, 0x8e,
			0xe5, 0xb9, 0xa7, 0x3e, 0x02, 0x66, 0x0e, 0x9a,
		}

		// Extract and convert the public key
		pubKey := testPrivateKey.Public().(ed25519.PublicKey)
		hexPubKey := hex.EncodeToString(pubKey)

		// Test the conversion (no client needed - pure cryptographic operation)
		walletAddr, err := hexPublicKeyToWalletAddress(hexPubKey)
		require.NoError(t, err)
		require.NotEmpty(t, walletAddr)

		// Expected address for this specific public key using HighloadV3 wallet with DefaultSubwallet
		// Public key: 4d8e0a179e6262068f0a6fa9f7e63e3a4baa7be52c687f8ee5b9a73e02660e9a
		expectedAddr := "EQDeE2jr_PBefmFsMFbCai1rWy-PkzMdz3CXzW-TadbJ2vvm"

		// Verify the derived address matches exactly
		require.Equal(t, expectedAddr, walletAddr, "Address should match the expected deterministic value")

		// Verify we can parse it back (validates it's a proper TON address format)
		_, err = address.ParseAddr(walletAddr)
		require.NoError(t, err, "Generated address should be parseable as a valid TON address")
	})

	t.Run("InvalidHexString", func(t *testing.T) {
		_, err := hexPublicKeyToWalletAddress("not-valid-hex")
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid hex-encoded public key")
	})

	t.Run("InvalidKeySize", func(t *testing.T) {
		shortHex := "00112233" // Only 4 bytes, not 32
		_, err := hexPublicKeyToWalletAddress(shortHex)
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid public key size")
	})
}
