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

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
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

	codec := addressCodec{}
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
	codec := addressCodec{}

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
	codec := addressCodec{}

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

func TestUserFriendlyFormatSupport(t *testing.T) {
	codec := addressCodec{}

	// Create a valid TON address
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	// Build user-friendly format bytes
	userFriendlyBytes, err := ToUserFriendlyAddr(addr)
	require.NoError(t, err)

	t.Run("valid user-friendly format", func(t *testing.T) {
		str, err := codec.AddressBytesToString(userFriendlyBytes[:])
		require.NoError(t, err)
		require.Equal(t, addr.String(), str)
	})

	t.Run("AddressBytesToTONAddress uses legacy raw format", func(t *testing.T) {
		// Legacy raw format: 4-byte workchain (big-endian) + 32-byte data
		rawBytes := make([]byte, 36)
		binary.BigEndian.PutUint32(rawBytes[0:4], uint32(addr.Workchain()))
		copy(rawBytes[4:], addr.Data())

		tonAddr, err := AddressBytesToTONAddress(rawBytes)
		require.NoError(t, err)
		require.True(t, addr.Equals(tonAddr))
	})

	// optional sanity check that might be removed
	// t.Run("AddressBytesToTONAddress invalid length", func(t *testing.T) {
	// 	_, err := AddressBytesToTONAddress([]byte("short"))
	// 	require.Error(t, err)
	//	require.Contains(t, err.Error(), "invalid address length")
	// })
	//
	// t.Run("AddressBytesToTONAddress invalid workchain", func(t *testing.T) {
	//	rawBytes := make([]byte, 36)
	//	binary.BigEndian.PutUint32(rawBytes[0:4], 0xFFFFFF00) // out of int8 range
	//	_, err := AddressBytesToTONAddress(rawBytes)
	//	require.Error(t, err)
	//	require.ErrorIs(t, err, ErrInvalidWorkchain)
	// })

	t.Run("invalid checksum returns zero address", func(t *testing.T) {
		// Create bytes with invalid checksum
		invalidBytes := make([]byte, 36)
		copy(invalidBytes, userFriendlyBytes[:])
		invalidBytes[34] = 0x00 // corrupt checksum
		invalidBytes[35] = 0x00

		// AddressBytesToString should return zero address (funds burned)
		str, err := codec.AddressBytesToString(invalidBytes)
		require.NoError(t, err)
		require.Equal(t, tvm.ZeroAddress.String(), str)
	})

	t.Run("random 36 bytes returns zero address from AddressBytesToString", func(t *testing.T) {
		// Random bytes that don't have valid checksum
		randomBytes := make([]byte, 36)
		for i := range randomBytes {
			randomBytes[i] = byte(i * 7) // arbitrary pattern
		}

		str, err := codec.AddressBytesToString(randomBytes)
		require.NoError(t, err)
		require.Equal(t, tvm.ZeroAddress.String(), str)
	})

	t.Run("invalid length - too short returns zero address from AddressBytesToString", func(t *testing.T) {
		str, err := codec.AddressBytesToString(userFriendlyBytes[:35])
		require.NoError(t, err)
		require.Equal(t, tvm.ZeroAddress.String(), str)
	})

	t.Run("invalid length - too long returns zero address from AddressBytesToString", func(t *testing.T) {
		tooLong := make([]byte, len(userFriendlyBytes)+1)
		copy(tooLong, userFriendlyBytes[:])
		str, err := codec.AddressBytesToString(tooLong)
		require.NoError(t, err)
		require.Equal(t, tvm.ZeroAddress.String(), str)
	})
}

func TestInvalidChecksumReturnsZeroAddress(t *testing.T) {
	codec := addressCodec{}

	// Create a valid address for reference
	validAddr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)
	validBytes, err := ToUserFriendlyAddr(validAddr)
	require.NoError(t, err)

	testCases := []struct {
		name  string
		bytes []byte
	}{
		{
			name: "all zeros except last byte",
			bytes: func() []byte {
				b := make([]byte, 36)
				b[35] = 0x01 // CRC16 of 34 zeros is 0x0000, so add 0x01 to make it invalid
				return b
			}(),
		},
		{
			name: "all 0xFF",
			bytes: func() []byte {
				b := make([]byte, 36)
				for i := range b {
					b[i] = 0xFF
				}
				return b
			}(),
		},
		{
			name: "valid data with corrupted checksum (single bit flip)",
			bytes: func() []byte {
				b := make([]byte, 36)
				copy(b, validBytes[:])
				b[34] ^= 0x01 // flip one bit in checksum
				return b
			}(),
		},
		{
			name: "valid data with zeroed checksum",
			bytes: func() []byte {
				b := make([]byte, 36)
				copy(b, validBytes[:])
				b[34] = 0x00
				b[35] = 0x00
				return b
			}(),
		},
		{
			name: "valid data with swapped checksum bytes",
			bytes: func() []byte {
				b := make([]byte, 36)
				copy(b, validBytes[:])
				b[34], b[35] = b[35], b[34] // swap checksum bytes
				return b
			}(),
		},
		{
			name: "sequential bytes pattern",
			bytes: func() []byte {
				b := make([]byte, 36)
				for i := range b {
					b[i] = byte(i)
				}
				return b
			}(),
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Verify checksum is actually invalid (sanity check)
			expectedChecksum := binary.BigEndian.Uint16(tc.bytes[34:36])
			actualChecksum := crc16.Checksum(tc.bytes[:34], crcTable)
			require.NotEqual(t, expectedChecksum, actualChecksum, "test case should have invalid checksum")

			// Test AddressBytesToString returns zero address (user-friendly format with invalid CRC16)
			str, err := codec.AddressBytesToString(tc.bytes)
			require.NoError(t, err, "should not return error for invalid checksum")
			require.Equal(t, tvm.ZeroAddress.String(), str, "should return zero address string")
		})
	}
}

func TestZeroAddressProperties(t *testing.T) {
	// Verify zero address has expected properties
	require.Equal(t, int32(0), tvm.ZeroAddress.Workchain())
	require.Equal(t, make([]byte, 32), tvm.ZeroAddress.Data())

	// Verify zero address string format
	zeroAddrStr := tvm.ZeroAddress.String()
	require.NotEmpty(t, zeroAddrStr)

	// Verify zero address can be parsed back
	parsedZero, err := address.ParseAddr(zeroAddrStr)
	require.NoError(t, err)
	require.True(t, tvm.ZeroAddress.Equals(parsedZero))
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

		// Verify we can convert back via base64 parsing
		addrStr := base64.RawURLEncoding.EncodeToString(userFriendly[:])
		recoveredAddr, err := address.ParseAddr(addrStr)
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

		// Verify we can convert back via base64 parsing and get the same workchain
		addrStr := base64.RawURLEncoding.EncodeToString(userFriendly[:])
		recoveredAddr, err := address.ParseAddr(addrStr)
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
	codec := addressCodec{}

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
	codec := addressCodec{}

	// Invalid-length inputs are treated the same as invalid checksums:
	// ParseAddr fails and the zero address is returned.
	testCases := []struct {
		name  string
		input []byte
	}{
		{"nil input", nil},
		{"empty input", []byte{}},
		{"35 bytes - too short", make([]byte, 35)},
		{"37 bytes - too long", make([]byte, 37)},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			str, err := codec.AddressBytesToString(tc.input)
			require.NoError(t, err)
			require.Equal(t, tvm.ZeroAddress.String(), str)
		})
	}
}
