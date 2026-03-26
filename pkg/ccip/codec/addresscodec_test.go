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

func TestCRC16Validation(t *testing.T) {
	codec := addressCodec{}

	// Create a valid user-friendly address
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	validBytes, err := ToUserFriendlyAddr(addr)
	require.NoError(t, err)

	tests := []struct {
		name        string
		modifyBytes func([]byte) []byte
		expectError bool
	}{
		{
			name: "valid address",
			modifyBytes: func(b []byte) []byte {
				return b
			},
			expectError: false,
		},
		{
			name: "invalid CRC16 - zeroed checksum",
			modifyBytes: func(b []byte) []byte {
				modified := make([]byte, len(b))
				copy(modified, b)
				modified[34] = 0x00
				modified[35] = 0x00
				return modified
			},
			expectError: true,
		},
		{
			name: "invalid CRC16 - corrupted data",
			modifyBytes: func(b []byte) []byte {
				modified := make([]byte, len(b))
				copy(modified, b)
				modified[10] ^= 0xFF // flip bits in data section
				return modified
			},
			expectError: true,
		},
		{
			name: "invalid length - too short",
			modifyBytes: func(b []byte) []byte {
				return b[:35]
			},
			expectError: true,
		},
		{
			name: "invalid length - too long",
			modifyBytes: func(b []byte) []byte {
				return append(b, 0x00)
			},
			expectError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			testBytes := tc.modifyBytes(validBytes[:])

			_, err := codec.AddressBytesToString(testBytes)
			if tc.expectError {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}

			_, err = AddressBytesToTONAddress(testBytes)
			if tc.expectError {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
