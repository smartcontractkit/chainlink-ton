package codec

import (
	"crypto/ed25519"
	crypto_rand "crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
)

func TestTONAddress(t *testing.T) {
	addr, err := address.ParseAddr("EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2")
	require.NoError(t, err)

	validAddressBytes := make([]byte, 36)
	binary.BigEndian.PutUint32(validAddressBytes[0:4], uint32(addr.Workchain())) //nolint:gosec // G115
	copy(validAddressBytes[4:], addr.Data())

	invalidChecksum := make([]byte, 0)
	invalidChecksum = append(invalidChecksum, validAddressBytes[:34]...)
	invalidChecksum = append(invalidChecksum, 0x00, 0x00)
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
	addr := make([]byte, 32)
	binary.BigEndian.PutUint32(addr, uint32(oracleID))
	tonAddr := address.NewAddress(0, 0, addr)
	rawAddr, err := ToRawAddr(tonAddr)
	if err != nil {
		panic(err)
	}
	return rawAddr[:]
}

func TestValidateWorkchain(t *testing.T) {
	codec := addressCodec{}

	tests := []struct {
		name        string
		workchain   int32
		expectError bool
	}{
		{
			name:        "valid workchain 0 (basechain)",
			workchain:   0,
			expectError: false,
		},
		{
			name:        "valid workchain -1 (masterchain)",
			workchain:   -1,
			expectError: false,
		},
		{
			name:        "valid workchain 127 (max int8)",
			workchain:   127,
			expectError: false,
		},
		{
			name:        "valid workchain -128 (min int8)",
			workchain:   -128,
			expectError: false,
		},
		{
			name:        "invalid workchain 128 (overflow)",
			workchain:   128,
			expectError: true,
		},
		{
			name:        "invalid workchain -129 (underflow)",
			workchain:   -129,
			expectError: true,
		},
		{
			name:        "invalid workchain 256",
			workchain:   256,
			expectError: true,
		},
		{
			name:        "invalid workchain 1000000",
			workchain:   1000000,
			expectError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Create raw address with the specified workchain
			rawBytes := make([]byte, 36)
			binary.BigEndian.PutUint32(rawBytes[0:4], uint32(tc.workchain)) //nolint:gosec // G115: intentional for testing edge cases
			// Dummy address data
			for i := 4; i < 36; i++ {
				rawBytes[i] = byte(i)
			}

			_, err := codec.AddressBytesToString(rawBytes)
			if tc.expectError {
				require.Error(t, err)
				require.ErrorIs(t, err, ErrInvalidWorkchain)
			} else {
				require.NoError(t, err)
			}

			_, err = AddressBytesToTONAddress(rawBytes)
			if tc.expectError {
				require.Error(t, err)
				require.ErrorIs(t, err, ErrInvalidWorkchain)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
