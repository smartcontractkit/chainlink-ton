package event

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

// CCIPEventTopics maps TON event topics (CRC32 hashes) to their event names.
// Only includes events that are actually emitted as external out messages.
//
// Event descriptions from TON CCIP contracts:
//
// ExecutionStateChanged (OffRamp):
//
//	Emitted when a CCIP message execution state changes (in progress, success, failure).
//	Contains: sourceChainSelector, sequenceNumber, messageId, state (1=in progress, 2=success, 3=failure).
//
// CommitReportAccepted (OffRamp):
//
//	Emitted when a commit report is accepted, containing merkle roots and/or price updates.
//	Contains: merkleRoot (optional), priceUpdates (optional).
//
// CCIPMessageSent (OnRamp):
//
//	Emitted when a CCIP message is sent from TON to another chain.
//	Contains: TVM2AnyRampMessage with all message details.
//
// OCR3Base_ConfigSet (OCR3Base):
//
//	Triggers a new run of the offchain reporting protocol when config is set.
//	Contains: ocrPluginType, configDigest, signers, transmitters, F (max faulty oracles).
//
// OCR3Base_Transmitted (OCR3Base):
//
//	Indicates the latest configDigest and sequence number for a successfully transmitted report.
//	Contains: ocrPluginType, configDigest, sequenceNumber.
var CCIPEventTopics = map[uint32]string{
	hash.CRC32("ExecutionStateChanged"): "ExecutionStateChanged",
	hash.CRC32("CommitReportAccepted"):  "CommitReportAccepted",
	hash.CRC32("CCIPMessageSent"):       "CCIPMessageSent",
	hash.CRC32("OCR3Base_ConfigSet"):    "OCR3Base_ConfigSet",
	hash.CRC32("OCR3Base_Transmitted"):  "OCR3Base_Transmitted",
}

// GetEventName returns the event name for a given topic, or a formatted unknown topic string.
func GetEventName(topic uint32) string {
	if name, ok := CCIPEventTopics[topic]; ok {
		return name
	}
	return fmt.Sprintf("Unknown_0x%08x", topic)
}
