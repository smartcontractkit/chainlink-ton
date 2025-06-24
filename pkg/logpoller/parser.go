package logpoller

import (
	"encoding/binary"

	"github.com/xssnick/tonutils-go/address"
)

// ExtOutLogBucket dst-address format is: [prefix..][topic:8 bytes]
// We grab the last 8 bytes.
// TODO: add link for ExtOutLogBucket format and specification
func ExtractEventTopicFromAddress(addr *address.Address) uint64 {
	data := addr.Data() // 32 bytes
	return binary.BigEndian.Uint64(data[24:])
}
