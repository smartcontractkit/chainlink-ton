package evm

import (
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_2_0/router"
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/onramp"
)

var RouterABI = router.RouterABI
var OnRampABI = onramp.OnRampABI

// MessageReceived event ABI
const MessageReceivedEventABI = `[{
	"anonymous":false,
	"inputs":[
		{
			"indexed":false,
			"internalType":"bytes32",
			"name":"messageId",
			"type":"bytes32"
		},
		{
			"indexed":false,
			"internalType":"uint64",
			"name":"sourceChainSelector",
			"type":"uint64"
		},
		{
			"indexed":false,
			"internalType":"bytes",
			"name":"sender",
			"type":"bytes"
		},
		{
			"indexed":false,
			"internalType":"bytes",
			"name":"data",
			"type":"bytes"
		},
		{
			"components":[
				{
					"internalType":"address",
					"name":"token",
					"type":"address"
				},
				{
					"internalType":"uint256",
					"name":"amount",
					"type":"uint256"
				}
			],
			"indexed":false,
			"internalType":"struct Client.EVMTokenAmount[]",
			"name":"destTokenAmounts",
			"type":"tuple[]"
		}
	],
	"name":"MessageReceived",
	"type":"event"
}]`

// MessageReceivedEvent represents the MessageReceived event structure
type MessageReceivedEvent struct {
	MessageID           [32]byte
	SourceChainSelector uint64
	Sender              []byte
	Data                []byte
	DestTokenAmounts    []router.ClientEVMTokenAmount
}
