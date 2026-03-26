package codec

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/sigurn/crc16"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var crcTable = crc16.MakeTable(crc16.CRC16_XMODEM)

// ErrInvalidWorkchain is returned when a workchain value is outside the valid int8 range.
var ErrInvalidWorkchain = errors.New("workchain value outside valid int8 range [-128, 127]")

// validateWorkchain checks that a workchain value fits within the int8 range.
// tonutils-go internally treats the workchain as int8, so values outside [-128, 127]
// would silently wrap, potentially targeting the wrong contract.
func validateWorkchain(workchain int32) error {
	if workchain < -128 || workchain > 127 {
		return fmt.Errorf("%w: got %d", ErrInvalidWorkchain, workchain)
	}
	return nil
}

type addressCodec struct{}

var _ ccipocr3.ChainSpecificAddressCodec = &addressCodec{}

// The codec expects user-friendly address format (36 bytes):
//
//	`1 byte flags + 1 byte workchain (int8) + 32 byte data + 2 byte CRC16`
//
// This matches Solidity's _validateTVMAddress in chainlink-ccip Internal.sol.
//
// When decoding, CRC16 validation is performed. If it fails, the zero address is returned
// to indicate the funds should be treated as burned.
//
// For correctness *address.Address should always be compared using .Equals() since user-friendly addresses can represent
// the same address with different flags.

// UserFriendlyAddr is a fixed-size byte array representing a TON user-friendly address.
// Format: 1 byte flags + 1 byte workchain + 32 bytes data + 2 bytes CRC16
type UserFriendlyAddr [tvm.AddressLength]byte

// RawAddr is an alias for UserFriendlyAddr for backwards compatibility with existing code.
type RawAddr = UserFriendlyAddr

// ToUserFriendlyAddr converts an address.Address to a UserFriendlyAddr (36 bytes).
// Format: 1 byte flags + 1 byte workchain + 32 bytes data + 2 bytes CRC16
func ToUserFriendlyAddr(addr *address.Address) (UserFriendlyAddr, error) {
	if addr == nil {
		return UserFriendlyAddr{}, errors.New("cannot convert nil address to user-friendly format")
	}
	if addr.IsAddrNone() {
		return UserFriendlyAddr{}, errors.New("cannot convert none address to user-friendly format")
	}
	// Standard TON addresses have exactly 32 bytes of data
	if len(addr.Data()) != tvm.AddressDataLength {
		return UserFriendlyAddr{}, fmt.Errorf("invalid address data length: expected %d bytes, got %d", tvm.AddressDataLength, len(addr.Data()))
	}
	var buf UserFriendlyAddr
	buf[0] = addr.FlagsToByte()
	buf[1] = byte(addr.Workchain())
	copy(buf[2:34], addr.Data())
	binary.BigEndian.PutUint16(buf[34:], crc16.Checksum(buf[:34], crcTable))
	return buf, nil
}

// ToRawAddr is an alias for ToUserFriendlyAddr for backwards compatibility with existing code.
func ToRawAddr(addr *address.Address) (RawAddr, error) {
	return ToUserFriendlyAddr(addr)
}

func NewAddressCodec() ccipocr3.ChainSpecificAddressCodec {
	return addressCodec{}
}

// AddressBytesToString converts a byte slice representing a TON address into its string representation.
// Expects user-friendly format (36 bytes): 1 byte flags + 1 byte workchain + 32 bytes data + 2 bytes CRC16.
// If parsing fails (invalid format, length, or CRC16), returns the zero address to indicate funds should be burned.
func (a addressCodec) AddressBytesToString(bytes []byte) (string, error) {
	// Validate CRC16 checksum
	addrStr := base64.RawURLEncoding.EncodeToString(bytes)
	addr, err := address.ParseAddr(addrStr)
	if err != nil {
		// Checksum failed or invalid address format - return zero address to mark funds as burned
		return tvm.ZeroAddress.String(), nil
	}

	return addr.String(), nil
}

// AddressStringToBytes converts a string representation of a TON address into its user-friendly byte representation.
// Output format: 1 byte flags + 1 byte workchain + 32 bytes data + 2 bytes CRC16
func (a addressCodec) AddressStringToBytes(addrString string) ([]byte, error) {
	// ParseAddr currently only works for base64 encoded std address strings, any other address format will fail
	addr, err := address.ParseAddr(addrString)
	if err != nil {
		return nil, fmt.Errorf("failed to decode TVM address: %w", err)
	}

	userFriendlyAddr, err := ToUserFriendlyAddr(addr)
	if err != nil {
		return nil, fmt.Errorf("failed to convert address to user-friendly format: %w", err)
	}
	return userFriendlyAddr[:], nil
}

// OracleIDAsAddressBytes converts an oracle ID (uint8) into a byte slice representing a TON address.
// This address is just used by libocr to make sure transmitters are unique, the addresses aren't used any other way.
func (a addressCodec) OracleIDAsAddressBytes(oracleID uint8) ([]byte, error) {
	data := make([]byte, 32)
	// write oracleID into data in big endian
	binary.BigEndian.PutUint32(data, uint32(oracleID))
	tonAddr := address.NewAddress(0, 0, data)
	userFriendlyAddr, err := ToUserFriendlyAddr(tonAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to convert oracle ID address to user-friendly format: %w", err)
	}
	return userFriendlyAddr[:], nil
}

// TransmitterBytesToString converts a byte slice representing a transmitter account into its string representation.
func (a addressCodec) TransmitterBytesToString(addr []byte) (string, error) {
	// Transmitter accounts are ed25519 public keys, and encoded as a hex string without
	// a 0x prefix.
	return hex.EncodeToString(addr), nil
}

// AddressBytesToTONAddress converts a byte slice representing a TON address into its *address.Address representation.
// This method is not part of the interface as it's TON specific.
// It uses the legacy raw format (4-byte workchain + 32-byte data) used by off-chain tooling and CCIPHome.
func AddressBytesToTONAddress(bytes []byte) (*address.Address, error) {
	if len(bytes) != tvm.AddressLength {
		return nil, fmt.Errorf("invalid address length: expected %d bytes, got %d", tvm.AddressLength, len(bytes))
	}
	var rawAddr RawAddr
	copy(rawAddr[:], bytes)
	workchain := int32(binary.BigEndian.Uint32(rawAddr[0:4])) //nolint:gosec // G115
	if err := validateWorkchain(workchain); err != nil {
		return nil, err
	}

	addr := address.NewAddress(0, byte(workchain), rawAddr[4:])
	return addr, nil
}
