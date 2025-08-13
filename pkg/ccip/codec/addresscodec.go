package codec

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
)

type AddressCodec struct{}

// For the sake of comparison and storage, home chain and other registries should use the raw format of the address
// `4 byte workchain (int32) + 32 byte data`
//
// For correctness *address.Address should always be compared using .Equals() since user-friendly addresses can represent
// the same address with different flags.

// RawAddr is a fixed-size byte array representing a TON standard address
type RawAddr [36]byte

// ToRawAddr converts an address.Address to a RawAddr.
func ToRawAddr(addr *address.Address) (rawAddress RawAddr) {
	binary.BigEndian.PutUint32(rawAddress[0:], uint32(addr.Workchain())) //nolint:gosec // G115
	copy(rawAddress[4:], addr.Data())
	return rawAddress
}

// AddressBytesToString converts a byte slice representing a TON address into its string representation, only supporting standard TON addresses.
func (a AddressCodec) AddressBytesToString(bytes []byte) (string, error) {
	if len(bytes) != 36 {
		return "", fmt.Errorf("invalid address length: expected 36 bytes, got %d", len(bytes))
	}
	var rawAddr RawAddr
	copy(rawAddr[:], bytes)
	workchain := int32(binary.BigEndian.Uint32(rawAddr[0:4])) //nolint:gosec // G115

	addr := address.NewAddress(0, byte(workchain), rawAddr[4:])
	return addr.String(), nil
}

// AddressStringToBytes converts a string representation of a TON address into its byte representation.
func (a AddressCodec) AddressStringToBytes(addrString string) ([]byte, error) {
	// ParseAddr currently only works for base64 encoded std address strings, any other address format will fail
	addr, err := address.ParseAddr(addrString)
	if err != nil {
		return nil, fmt.Errorf("failed to decode TVM address: %w", err)
	}

	rawAddr := ToRawAddr(addr)
	return rawAddr[:], nil
}

// OracleIDAsAddressBytes converts an oracle ID (uint8) into a byte slice representing a TON address.
func (a AddressCodec) OracleIDAsAddressBytes(oracleID uint8) ([]byte, error) {
	addr := make([]byte, 32)
	// write oracleID into addr in big endian
	binary.BigEndian.PutUint32(addr, uint32(oracleID))
	tonAddr := address.NewAddress(0, 0, addr)
	decodeString, err := base64.RawURLEncoding.DecodeString(tonAddr.String())
	if err != nil {
		return nil, fmt.Errorf("failed to decode TVM address bytes: %w", err)
	}

	return decodeString, nil
}

// TransmitterBytesToString converts a byte slice representing a transmitter account into its string representation.
func (a AddressCodec) TransmitterBytesToString(addr []byte) (string, error) {
	// Transmitter accounts are addresses
	return a.AddressBytesToString(addr)
}
