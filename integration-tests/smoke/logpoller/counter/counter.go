package counter

import (
	test_utils "integration-tests/utils"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

// TODO: move to proper location
var (
	ArtifactPath = test_utils.GetBuildDir("examples.counter.compiled.json")

	SetCountOpCode        uint32 = 0x10000004
	IncreaseCounterOpCode uint32 = 0x10000005

	CountSetEventTopic       uint32 = hash.CRC32("CountSet")
	CountIncreasedEventTopic uint32 = hash.CRC32("CountIncreased")
)

// initial data structure
type Storage struct {
	ID    uint32 `tlb:"## 32"`
	Value uint32 `tlb:"## 32"`
}

// incoming message bodies
type SetCountMsg struct {
	OpCode  uint32 `tlb:"## 32"`
	QueryID uint64 `tlb:"## 64"`
	Value   uint32 `tlb:"## 32"`
}

type IncreaseCountMsg struct {
	OpCode  uint32 `tlb:"## 32"`
	QueryID uint64 `tlb:"## 64"`
}

// events
type CountSetEvent struct {
	ID    uint32 `tlb:"## 32"`
	Value uint32 `tlb:"## 32"`
}

type CountIncreasedEvent struct {
	ID    uint32 `tlb:"## 32"`
	Value uint32 `tlb:"## 32"`
}
