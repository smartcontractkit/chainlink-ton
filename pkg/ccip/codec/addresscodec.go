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
type RawAddr [36]byte

func FromAddr(addr *address.Address) (rawAddress RawAddr) {
	binary.BigEndian.PutUint32(rawAddress[0:], uint32(addr.Workchain()))
	copy(rawAddress[4:], addr.Data())
	return rawAddress
}

func (a AddressCodec) AddressBytesToString(bytes []byte) (string, error) {
	if len(bytes) != 36 {
		return "", fmt.Errorf("invalid address length: expected 36 bytes, got %d", len(bytes))
	}
	var rawAddr RawAddr
	copy(rawAddr[:], bytes[:])
	workchain := binary.BigEndian.Uint32(rawAddr[0:4])

	addr := address.NewAddress(0, byte(workchain), rawAddr[4:])
	return addr.StringRaw(), nil
}

func (a AddressCodec) AddressStringToBytes(addrString string) ([]byte, error) {
	// ParseRawAddr currently only works for hex encoded std address strings, any other address format will fail
	addr, err := address.ParseRawAddr(addrString)
	if err != nil {
		return nil, fmt.Errorf("failed to decode TVM address: %w", err)
	}

	rawAddr := FromAddr(addr)
	return rawAddr[:], nil
}

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

func (a AddressCodec) TransmitterBytesToString(addr []byte) (string, error) {
	// Transmitter accounts are addresses
	return a.AddressBytesToString(addr)
}
