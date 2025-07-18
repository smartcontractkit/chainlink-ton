package event

import (
	"encoding/binary"
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func LoadEventFromCell[T any](cell *cell.Cell) (T, error) {
	var event T
	if cell == nil {
		return event, errors.New("cell is nil")
	}
	err := tlb.LoadFromCell(&event, cell.BeginParse())
	if err != nil {
		return event, fmt.Errorf("failed to parse %T event: %w", event, err)
	}
	return event, nil
}

func LoadEventFromMsg[T any](msg *tlb.ExternalMessageOut) (T, error) {
	var event T
	if msg.Body == nil {
		return event, errors.New("message body is nil")
	}
	return LoadEventFromCell[T](msg.Body)
}

// ExtractEventTopicFromAddress extracts the event topic from a TON address.
// ExtOutLogBucket dst-address format is: [prefix..][topic:4 bytes]
// We grab the last 4 bytes as the topic identifier.
//
// Example:
// Tolk provides the ExtOutLogBucket construct, which encodes a topic identifier within the address itself:
// Structure: '01' (addr_extern) + 256 (len) + 0x00 (prefix) + 248 bits topic = 267 bits total
//
// While the topic space is large (248 bits), we have decided to use a 32-bit (4-byte) CRC32 checksum as the topic.
// See hash.go for the CRC32 calculation.
// https://github.com/ton-blockchain/intellij-ton/blob/2105f3cd39aafe164c9524079d6c73325e8f85e8/modules/tolk/testResources/org.ton.intellij.tolk/tolk-stdlib/common.tolk#L1093
const EventTopicLength = 4 // 32 bits
func ExtractEventTopicFromAddress(addr *address.Address) (uint32, error) {
	data := addr.Data()
	if len(data) < EventTopicLength {
		return 0, errors.New("address data is too short")
	}
	startIndex := len(data) - EventTopicLength
	return binary.BigEndian.Uint32(data[startIndex:]), nil
}
