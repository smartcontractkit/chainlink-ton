package receiver

import (
	"hash/crc32"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCCIPMessageReceivedEventTopicCRC32(t *testing.T) {
	computed := crc32.ChecksumIEEE([]byte("Receiver_CCIPMessageReceived"))
	require.Equal(t, uint32(CCIPMessageReceivedEventTopic), computed)
}
