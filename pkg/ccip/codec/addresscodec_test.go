package codec

import (
	"crypto/ed25519"
	crypto_rand "crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"testing"

	"github.com/sigurn/crc16"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
)

func TestTONAddress(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	// Build user-friendly format: flags (1) + workchain (1) + data (32) + crc16 (2)
	validAddressBytes := make([]byte, 36)
	validAddressBytes[0] = addr.FlagsToByte()
	validAddressBytes[1] = byte(addr.Workchain())
	copy(validAddressBytes[2:34], addr.Data())
	binary.BigEndian.PutUint16(validAddressBytes[34:], crc16.Checksum(validAddressBytes[:34], crcTable))

	// Create address with invalid checksum
	invalidChecksum := make([]byte, 36)
	copy(invalidChecksum, validAddressBytes)
	invalidChecksum[34] = 0x00
	invalidChecksum[35] = 0x00
	addressWithInvalidChecksum := base64.RawURLEncoding.EncodeToString(invalidChecksum)

	extAddr := address.NewAddressExt(0, 256, addr.Data())

	tests := []struct {
		name        string
		in          string
		expected    []byte
		expectedErr error
	}{
		{
			"hand crafted",
			addr.String(),
			validAddressBytes,
			nil,
		},
		{
			name:        "invalid base64",
			in:          "!!!notbase64!!!",
			expectedErr: errors.New("failed to decode TVM address: illegal base64 data at input byte 0"),
		},
		{
			name:        "invalid checksum",
			in:          addressWithInvalidChecksum,
			expectedErr: errors.New("failed to decode TVM address: invalid address"),
		},
		{
			name:        "ext address not supported",
			in:          extAddr.String(),
			expectedErr: errors.New("failed to decode TVM address: illegal base64 data at input byte 3"),
		},
	}

	codec := addressCodec{lggr: logger.Nop()}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := codec.AddressStringToBytes(test.in)
			if test.expectedErr == nil {
				require.NoError(t, err)
				require.Equal(t, test.expected, actual)
			} else {
				require.EqualError(t, err, test.expectedErr.Error())
			}
		})
	}
}

func TestAddressCodec_OracleIDAsAddressBytes(t *testing.T) {
	codec := addressCodec{lggr: logger.Nop()}

	testCases := []struct {
		name     string
		oracleID uint8
		expected []byte
	}{
		{
			name:     "oracleID 0",
			oracleID: 0,
			expected: func() []byte {
				return packOracleID(0)
			}(),
		},
		{
			name:     "oracleID 1",
			oracleID: 1,
			expected: func() []byte {
				return packOracleID(1)
			}(),
		},
		{
			name:     "oracleID 255",
			oracleID: 255,
			expected: func() []byte {
				return packOracleID(255)
			}(),
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			actual, err := codec.OracleIDAsAddressBytes(tc.oracleID)

			require.NoError(t, err)
			require.Equal(t, tc.expected, actual, "expected %x, got %x", tc.expected, actual)
			require.Len(t, actual, 36)
		})
	}
}

func TestAddressCodec_TransmitterBytesToString(t *testing.T) {
	codec := addressCodec{lggr: logger.Nop()}

	// Generate a real ed25519 key for testing
	pubKey, _, err := ed25519.GenerateKey(crypto_rand.Reader)
	require.NoError(t, err)

	testCases := []struct {
		name     string
		input    []byte
		expected string
	}{
		{
			name:     "valid ed25519 public key",
			input:    pubKey,
			expected: hex.EncodeToString(pubKey),
		},
		{
			name:     "32-byte key with mixed values",
			input:    []byte{0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef},
			expected: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		},
		{
			name:     "all zeros",
			input:    make([]byte, 32),
			expected: "0000000000000000000000000000000000000000000000000000000000000000",
		},
		{
			name:     "all ones",
			input:    []byte{0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff},
			expected: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		},
		{
			name:     "empty input",
			input:    []byte{},
			expected: "",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			actual, err := codec.TransmitterBytesToString(tc.input)

			require.NoError(t, err)
			require.Equal(t, tc.expected, actual)
		})
	}
}

func packOracleID(oracleID uint8) []byte {
	data := make([]byte, 32)
	binary.BigEndian.PutUint32(data, uint32(oracleID))
	tonAddr := address.NewAddress(0, 0, data)
	userFriendlyAddr, err := ToUserFriendlyAddr(tonAddr)
	if err != nil {
		panic(err)
	}
	return userFriendlyAddr[:]
}

func TestDualFormatSupport(t *testing.T) {
	codec := addressCodec{lggr: logger.Nop()}

	// Create a valid TON address
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	// Build user-friendly format bytes
	userFriendlyBytes, err := ToUserFriendlyAddr(addr)
	require.NoError(t, err)

	// Build legacy raw format bytes: 4-byte workchain + 32-byte data
	legacyBytes := make([]byte, 36)
	binary.BigEndian.PutUint32(legacyBytes[0:4], uint32(addr.Workchain())) //nolint:gosec // G115
	copy(legacyBytes[4:], addr.Data())

	t.Run("user-friendly format", func(t *testing.T) {
		str, err := codec.AddressBytesToString(userFriendlyBytes[:])
		require.NoError(t, err)
		require.Equal(t, addr.String(), str)

		tonAddr, err := AddressBytesToTONAddress(userFriendlyBytes[:])
		require.NoError(t, err)
		require.True(t, addr.Equals(tonAddr))
	})

	t.Run("legacy raw format", func(t *testing.T) {
		str, err := codec.AddressBytesToString(legacyBytes)
		require.NoError(t, err)
		// Legacy format doesn't preserve flags, so we compare the underlying address
		parsedAddr, err := address.ParseAddr(str)
		require.NoError(t, err)
		require.True(t, addr.Equals(parsedAddr))

		tonAddr, err := AddressBytesToTONAddress(legacyBytes)
		require.NoError(t, err)
		require.True(t, addr.Equals(tonAddr))
	})

	t.Run("legacy format with masterchain (-1)", func(t *testing.T) {
		masterchainAddr := address.NewAddress(0, 0xFF, addr.Data()) // 0xFF = -1 as int8

		legacyMasterchain := make([]byte, 36)
		// Write -1 as int32 in big-endian (0xFFFFFFFF)
		legacyMasterchain[0] = 0xFF
		legacyMasterchain[1] = 0xFF
		legacyMasterchain[2] = 0xFF
		legacyMasterchain[3] = 0xFF
		copy(legacyMasterchain[4:], masterchainAddr.Data())

		tonAddr, err := AddressBytesToTONAddress(legacyMasterchain)
		require.NoError(t, err)
		require.Equal(t, int32(-1), tonAddr.Workchain())
	})

	t.Run("invalid length - too short", func(t *testing.T) {
		_, err := codec.AddressBytesToString(userFriendlyBytes[:35])
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid address length")

		_, err = AddressBytesToTONAddress(userFriendlyBytes[:35])
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid address length")
	})

	t.Run("invalid length - too long", func(t *testing.T) {
		tooLong := append(userFriendlyBytes[:], 0x00)
		_, err := codec.AddressBytesToString(tooLong)
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid address length")

		_, err = AddressBytesToTONAddress(tooLong)
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid address length")
	})
}

func TestLegacyFormatWorkchainHandling(t *testing.T) {
	codec := addressCodec{lggr: logger.Nop()}

	// Create dummy address data
	data := make([]byte, 32)
	for i := range data {
		data[i] = byte(i + 1)
	}

	// All workchain values should succeed (no error), but values outside int8 range
	// will be truncated and logged as warnings
	tests := []struct {
		name              string
		workchain         int32
		expectedWorkchain int32 // after truncation to int8
	}{
		{
			name:              "workchain 0 (basechain)",
			workchain:         0,
			expectedWorkchain: 0,
		},
		{
			name:              "workchain -1 (masterchain)",
			workchain:         -1,
			expectedWorkchain: -1,
		},
		{
			name:              "workchain 127 (max int8)",
			workchain:         127,
			expectedWorkchain: 127,
		},
		{
			name:              "workchain -128 (min int8)",
			workchain:         -128,
			expectedWorkchain: -128,
		},
		{
			name:              "workchain 128 (truncates to -128)",
			workchain:         128,
			expectedWorkchain: -128, // 128 as int8 wraps to -128
		},
		{
			name:              "workchain 256 (truncates to 0)",
			workchain:         256,
			expectedWorkchain: 0, // 256 as int8 wraps to 0
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Build legacy format bytes with specified workchain
			legacyBytes := make([]byte, 36)
			binary.BigEndian.PutUint32(legacyBytes[0:4], uint32(tc.workchain)) //nolint:gosec // G115
			copy(legacyBytes[4:], data)

			// Should not error - invalid workchains are logged but not rejected
			_, err := codec.AddressBytesToString(legacyBytes)
			require.NoError(t, err)

			tonAddr, err := AddressBytesToTONAddress(legacyBytes)
			require.NoError(t, err)
			require.Equal(t, tc.expectedWorkchain, tonAddr.Workchain())
		})
	}
}

func TestToUserFriendlyAddr(t *testing.T) {
	t.Run("valid address", func(t *testing.T) {
		addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
		require.NoError(t, err)

		userFriendly, err := ToUserFriendlyAddr(addr)
		require.NoError(t, err)
		require.Len(t, userFriendly, 36)

		// Verify CRC16 is correct
		expectedChecksum := crc16.Checksum(userFriendly[:34], crcTable)
		actualChecksum := binary.BigEndian.Uint16(userFriendly[34:36])
		require.Equal(t, expectedChecksum, actualChecksum)

		// Verify we can convert back
		recoveredAddr, err := AddressBytesToTONAddress(userFriendly[:])
		require.NoError(t, err)
		require.True(t, addr.Equals(recoveredAddr))
	})

	t.Run("nil address", func(t *testing.T) {
		_, err := ToUserFriendlyAddr(nil)
		require.Error(t, err)
		require.Contains(t, err.Error(), "cannot convert nil address")
	})

	t.Run("none address", func(t *testing.T) {
		noneAddr := address.NewAddressNone()
		_, err := ToUserFriendlyAddr(noneAddr)
		require.Error(t, err)
		require.Contains(t, err.Error(), "cannot convert none address")
	})

	t.Run("masterchain address", func(t *testing.T) {
		data := make([]byte, 32)
		for i := range data {
			data[i] = byte(i)
		}
		masterchainAddr := address.NewAddress(0, 0xFF, data) // 0xFF = -1 as int8

		userFriendly, err := ToUserFriendlyAddr(masterchainAddr)
		require.NoError(t, err)

		// Verify workchain byte is 0xFF (-1)
		require.Equal(t, byte(0xFF), userFriendly[1])

		// Verify we can convert back and get the same workchain
		recoveredAddr, err := AddressBytesToTONAddress(userFriendly[:])
		require.NoError(t, err)
		require.Equal(t, int32(-1), recoveredAddr.Workchain())
	})
}

func TestToRawAddr(t *testing.T) {
	// ToRawAddr is an alias for ToUserFriendlyAddr, just verify it works
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	rawAddr, err := ToRawAddr(addr)
	require.NoError(t, err)

	userFriendly, err := ToUserFriendlyAddr(addr)
	require.NoError(t, err)

	require.Equal(t, userFriendly, rawAddr)
}

func TestAddressRoundtrip(t *testing.T) {
	codec := addressCodec{lggr: logger.Nop()}

	testAddresses := []string{
		"EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2",
		"EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG",
		"EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
	}

	for _, addrStr := range testAddresses {
		t.Run(addrStr[:20]+"...", func(t *testing.T) {
			// String -> Bytes -> String roundtrip
			bytes, err := codec.AddressStringToBytes(addrStr)
			require.NoError(t, err)

			recoveredStr, err := codec.AddressBytesToString(bytes)
			require.NoError(t, err)

			// Parse both to compare (flags may differ in string representation)
			originalAddr, err := address.ParseAddr(addrStr)
			require.NoError(t, err)
			recoveredAddr, err := address.ParseAddr(recoveredStr)
			require.NoError(t, err)

			require.True(t, originalAddr.Equals(recoveredAddr),
				"roundtrip failed: original=%s, recovered=%s", addrStr, recoveredStr)
		})
	}
}

func TestAddressBytesToString_InvalidInput(t *testing.T) {
	codec := addressCodec{lggr: logger.Nop()}

	t.Run("nil input", func(t *testing.T) {
		_, err := codec.AddressBytesToString(nil)
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid address length")
	})

	t.Run("empty input", func(t *testing.T) {
		_, err := codec.AddressBytesToString([]byte{})
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid address length")
	})

	t.Run("35 bytes - too short", func(t *testing.T) {
		_, err := codec.AddressBytesToString(make([]byte, 35))
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid address length")
	})

	t.Run("37 bytes - too long", func(t *testing.T) {
		_, err := codec.AddressBytesToString(make([]byte, 37))
		require.Error(t, err)
		require.Contains(t, err.Error(), "invalid address length")
	})
}
