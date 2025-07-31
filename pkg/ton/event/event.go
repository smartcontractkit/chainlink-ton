package event

import (
	"encoding/binary"
	"errors"

	"github.com/xssnick/tonutils-go/address"
)

// ExtOutLogBucket dst-address format is: [prefix..][topic:N bytes]
//
// Example:
// Tolk provides the ExtOutLogBucket construct, which encodes a topic identifier within the address itself:
// Structure: '01' (addr_extern) + 256 (len) + 0x00 (prefix) + 248 bits topic = 267 bits total
//
// While the topic space is large (248 bits), we have decided to use a 32-bit (4-byte) CRC32 checksum as the topic.
// We grab the last 4 bytes as the topic identifier.(crc32)
// https://github.com/ton-blockchain/intellij-ton/blob/2105f3cd39aafe164c9524079d6c73325e8f85e8/modules/tolk/testResources/org.ton.intellij.tolk/tolk-stdlib/common.tolk#L1093
const EventTopicLength = 4

type ExtOutLogBucket struct {
	Address *address.Address // source address that contains the encoded event topic.
}

func NewExtOutLogBucket(addr *address.Address) *ExtOutLogBucket {
	return &ExtOutLogBucket{Address: addr}
}

func (b *ExtOutLogBucket) DecodeEventTopic() (uint32, error) {
	if b.Address == nil {
		return 0, errors.New("cannot decode from a nil address")
	}

	data := b.Address.Data()

	if len(data) < EventTopicLength {
		return 0, errors.New("address data is too short to contain an event topic")
	}
	startIndex := len(data) - EventTopicLength
	return binary.BigEndian.Uint32(data[startIndex:]), nil
}
