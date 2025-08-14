package codec

import (
	"encoding/base64"
	"encoding/binary"
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
				return packOracleID(t, 0)
			}(),
		},
		{
			name:     "oracleID 1",
			oracleID: 1,
			expected: func() []byte {
				return packOracleID(t, 1)
			}(),
		},
		{
			name:     "oracleID 255",
			oracleID: 255,
			expected: func() []byte {
				return packOracleID(t, 255)
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

func packOracleID(t *testing.T, oracleID uint8) []byte {
	addr := make([]byte, 32)
	binary.BigEndian.PutUint32(addr, uint32(oracleID))
	tonAddr := address.NewAddress(0, 0, addr)
	decodeString, err := base64.RawURLEncoding.DecodeString(tonAddr.String())
	if err != nil {
		t.Fatalf("failed to decode TVM address bytes: %v", err)
	}
	return decodeString
}
