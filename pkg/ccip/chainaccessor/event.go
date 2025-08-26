package chainaccessor

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ccip/pkg/chainaccessor"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
)

// bindContractEvent binds contract events to the logpoller for monitoring blockchain events.
// This operation is idempotent - if the same address exists, it performs no operation;
// if the address is changed, it updates to the new address, overwriting the existing one;
// if the contract is not bound, it binds to the new address.
// Supports OnRamp and OffRamp contract types with their respective event filters.
// Returns an error if filter registration fails.
func (a *TONAccessor) bindContractEvent(ctx context.Context, contractName string, address *address.Address) error {
	var eventNames []string

	switch contractName {
	case consts.ContractNameOnRamp:
		eventNames = []string{
			consts.EventNameCCIPMessageSent,
		}
	case consts.ContractNameOffRamp:
		eventNames = []string{
			consts.EventNameCommitReportAccepted,
			consts.EventNameExecutionStateChanged,
		}
	default:
		return nil // No events to bind for unknown contract types
	}

	for _, eventName := range eventNames {
		if err := a.registerFilterIfNotExists(ctx, eventName, address); err != nil {
			return fmt.Errorf("failed to register filter for event %s: %w", eventName, err)
		}
	}

	return nil
}

// registerFilterIfNotExists registers a filter for the given event if it doesn't already exist.
func (a *TONAccessor) registerFilterIfNotExists(ctx context.Context, eventName string, address *address.Address) error {
	hasFilter, err := a.logPoller.HasFilter(ctx, eventName)
	if err != nil {
		return fmt.Errorf("failed to check for filter: %w", err)
	}
	if hasFilter {
		return nil
	}

	filter := types.Filter{
		Name:     eventName,
		Address:  address,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: hash.CRC32(eventName),
	}

	if err := a.logPoller.RegisterFilter(ctx, filter); err != nil {
		return fmt.Errorf("failed to register logpoller filter: %w", err)
	}

	return nil
}

// convertCCIPMessageSent converts a TON-specific CCIPMessageSent event to a generic
// chainaccessor.SendRequestedEvent. This function is idempotent and performs a
// one-to-one mapping of event fields from the TON format to the standard CCIP format.
func (a *TONAccessor) convertCCIPMessageSent(
	tonEvent *onramp.CCIPMessageSent,
) *chainaccessor.SendRequestedEvent {
	msg := ccipocr3.Message{
		Header: ccipocr3.RampMessageHeader{
			MessageID:           ccipocr3.Bytes32(tonEvent.Message.Header.MessageID),
			SourceChainSelector: a.chainSelector,
			DestChainSelector:   ccipocr3.ChainSelector(tonEvent.Message.Header.DestChainSelector),
			SequenceNumber:      ccipocr3.SeqNum(tonEvent.Message.Header.SequenceNumber),
			Nonce:               tonEvent.Message.Header.Nonce,
		},
		Sender:         ccipocr3.UnknownAddress(tonEvent.Message.Sender.String()),
		Data:           ccipocr3.Bytes(tonEvent.Message.Body.Data),
		Receiver:       ccipocr3.UnknownAddress(tonEvent.Message.Body.Receiver),
		ExtraArgs:      ccipocr3.Bytes(tonEvent.Message.Body.ExtraArgs.ToBOC()),
		FeeToken:       ccipocr3.UnknownAddress(tonEvent.Message.Body.FeeToken.String()),
		FeeTokenAmount: ccipocr3.NewBigInt(tonEvent.Message.Body.FeeTokenAmount),
		// TokenAmounts:   tokenAmounts, // TODO: enable token transfer
	}
	genericEvent := &chainaccessor.SendRequestedEvent{
		DestChainSelector: msg.Header.DestChainSelector,
		SequenceNumber:    msg.Header.SequenceNumber,
		Message:           msg,
	}
	return genericEvent
}
