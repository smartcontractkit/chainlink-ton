---
id: dev-guides-explorer-development
title: Development
sidebar_label: Development
sidebar_position: 1
---

# TON Explorer Development Guide

For adding support to more contracts, you need to register your decoder in [`defaultDecoders`](../../../pkg/ton/debug/pretty_print.go). Decoders implement [`ContractDecoder`](../../../pkg/ton/debug/lib/lib.go) interface:

```go
type ContractDecoder interface {
	ContractType() cldf.ContractType
	InternalMessageInfo(body *cell.Cell) (MessageInfo, error)
	ExternalMessageInfo(body *cell.Cell) (MessageInfo, error)
	EventInfo(dstAddr *address.Address, msg *cell.Cell) (MessageInfo, error)
	ExitCodeInfo(exitCode tvm.ExitCode) (string, error)
}

// Describes a decoded message or event.
//
// - Name is a short name of the message/event type.
// - Body carries the contents of the message/event in both compact and detailed forms.
type MessageInfo interface {
	Name() string
	Body() BodyInfo
}

// BodyInfo describes the contents of a message or event.
//
// - Compact is a single-line representation.
// - Describe is a pretty-printed, multi-line representation.
type BodyInfo interface {
	Compact() string
	Describe() string
}
```

Your decoder should go in `pkg/ton/debug/decoders/<domain>` package. If it is a ccip contract, then in `pkg/ton/debug/decoders/ccip`. E.g. `pkg/ton/debug/decoders/ccip/feequoter/feequoter.go`.

I suggest not placing any business logic in the decoder. Instead, create a separate package for that, e.g. `pkg/ccip/bindings/feequoter/codec.go` and use it from the decoder.

When trying to parse a message, your decoder should return `codec.ErrUnknownMessage` if the opcode doesn't match. As we are relying on unique opcodes, if the opcode matches, you can assume the message is for your contract, and return a different error if the message is malformed.
