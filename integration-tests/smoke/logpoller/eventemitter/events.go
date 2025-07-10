package eventemitter

// onramp event(TON2ANY)
// TODO: remove once CAL interfaces are stable, for CAL event query example purpose

// struct CCIPMessageSent {
// 	destChainSelector: uint64;
// 	sequenceNumber: uint64;
// 	message: CCIPSend;
// }

// struct (0x00000001) CCIPSend {
// 	queryId: uint64;
// 	destChainSelector: uint64;
// 	receiver: cell; // bytes32?
// 	data: cell;
// 	tokenAmounts: cell; // vec<tokenAmount>
// 	feeToken: address;
// 	extraArgs: cell;
// }

type CCIPMessageSent struct {
	DestChainSelector uint64 `tlb:"## 64"`
	SequenceNumber    uint64 `tlb:"## 64"`
	// Message           CCIPSend `tlb:"^"`
}

// type CCIPSend struct {
// 	QueryId           uint64           `tlb:"## 64"`
// 	DestChainSelector uint64           `tlb:"## 64"`
// 	Receiver          *cell.Cell       `tlb:"^"`
// 	Data              *cell.Cell       `tlb:"^"` //use SnakeBytes?
// 	TokenAmounts      *cell.Cell       `tlb:"^"`
// 	FeeToken          *address.Address `tlb:"addr"`
// 	ExtraArgs         *cell.Cell       `tlb:"^"` // use SnakeBytes? once https://github.com/smartcontractkit/chainlink-ton/pull/51 is merged
// }
