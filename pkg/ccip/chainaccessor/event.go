package chainaccessor

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccip/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/hash"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	lptypes "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// CCIP log retention defaults
const (
	// defaultCCIPLogsRetention defines the duration for which logs critical for Commit/Exec plugins processing are retained.
	// Although Exec relies on permissionlessExecThreshold which is lower than 24hours for picking eligible CommitRoots,
	// Commit still can reach to older logs because it filters them by sequence numbers. For instance, in case of RMN curse on chain,
	// we might have logs waiting in OnRamp to be committed first. When outage takes days we still would
	// be able to bring back processing without replaying any logs from chain. You can read that param as
	// "how long CCIP can be down and still be able to process all the messages after getting back to life".
	// Breaching this threshold would require replaying chain using LogPoller from the beginning of the outage.
	// Using same default retention as v1.5 https://github.com/smartcontractkit/ccip/pull/530/files
	defaultCCIPLogsRetention = 30 * 24 * time.Hour // 30 days

	// defaultCCIPMaxLogsKept is the maximum number of logs to retain per filter.
	// 0 = unlimited (no count-based pruning).
	defaultCCIPMaxLogsKept = int64(0)
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
		a.lggr.Warnw("No event filters registered for unknown contract type",
			"contractName", contractName,
			"address", address.String())
		return nil // No events to bind for unknown contract types
	}

	for _, eventName := range eventNames {
		if err := a.registerFilter(ctx, eventName, address); err != nil {
			return fmt.Errorf("failed to register filter for event %s: %w", eventName, err)
		}
	}

	return nil
}

// registerFilter registers a filter for the given event if it doesn't already exist.
func (a *TONAccessor) registerFilter(ctx context.Context, name string, address *address.Address) error {
	filter := lptypes.Filter{
		Name:         name,
		Address:      address,
		MsgType:      tlb.MsgTypeExternalOut,
		EventSig:     hash.CRC32(name),
		LogRetention: defaultCCIPLogsRetention,
		MaxLogsKept:  defaultCCIPMaxLogsKept, // 0 = unlimited
	}

	if _, err := a.logPoller.RegisterFilter(ctx, filter); err != nil {
		return fmt.Errorf("failed to register logpoller filter: %w", err)
	}

	return nil
}

// convertCCIPMessageSent converts a TON-specific CCIPMessageSent event to a generic
// ccipocr3.SendRequestedEvent. This function is idempotent and performs a
// one-to-one mapping of event fields from the TON format to the standard CCIP format.
func (a *TONAccessor) convertCCIPMessageSent(
	tonEvent *onramp.CCIPMessageSent,
) (*ccipocr3.SendRequestedEvent, error) {
	senderAddr, err := codec.ToRawAddr(tonEvent.Message.Sender)
	if err != nil {
		return nil, fmt.Errorf("failed to convert sender address: %w", err)
	}
	feeTokenAddr, err := codec.ToRawAddr(tonEvent.Message.Body.FeeToken)
	if err != nil {
		return nil, fmt.Errorf("failed to convert fee token address: %w", err)
	}

	msg := ccipocr3.Message{
		Header: ccipocr3.RampMessageHeader{
			MessageID:           ccipocr3.Bytes32(tonEvent.Message.Header.MessageID),
			SourceChainSelector: a.chainSelector,
			DestChainSelector:   ccipocr3.ChainSelector(tonEvent.Message.Header.DestChainSelector),
			SequenceNumber:      ccipocr3.SeqNum(tonEvent.Message.Header.SequenceNumber),
			Nonce:               tonEvent.Message.Header.Nonce,
		},
		Sender:         ccipocr3.UnknownAddress(senderAddr[:]),
		Data:           ccipocr3.Bytes(tonEvent.Message.Body.Data),
		Receiver:       ccipocr3.UnknownAddress(tonEvent.Message.Body.Receiver),
		ExtraArgs:      ccipocr3.Bytes(tonEvent.Message.Body.ExtraArgs.ToBOC()),
		FeeToken:       ccipocr3.UnknownAddress(feeTokenAddr[:]),
		FeeTokenAmount: ccipocr3.NewBigInt(tonEvent.Message.Body.FeeTokenAmount.Nano()),
		// TODO(2025-01-09): TON CCIP currently supports message transfer only, not token transfer
		// TokenAmounts:   tokenAmounts,
	}
	genericEvent := &ccipocr3.SendRequestedEvent{
		DestChainSelector: msg.Header.DestChainSelector,
		SequenceNumber:    msg.Header.SequenceNumber,
		Message:           msg,
	}
	return genericEvent, nil
}

func (a *TONAccessor) validateCommitReportAcceptedEvent(
	log lptypes.TypedLog[offramp.CommitReportAccepted], gteTimestamp time.Time,
) (*offramp.CommitReportAccepted, error) {
	ev := &log.TypedData

	if log.TxTimestamp.Unix() < gteTimestamp.Unix() {
		return nil, fmt.Errorf("commit report accepted event timestamp is less than the minimum timestamp %v<%v",
			log.TxTimestamp, gteTimestamp.Unix())
	}

	if ev.MerkleRoot != nil {
		if err := a.validateMerkleRoot(ev.MerkleRoot); err != nil {
			return nil, fmt.Errorf("merkle roots: %w", err)
		}
	}

	if ev.PriceUpdates == nil {
		// Return early if there are no price updates to validate
		return ev, nil
	}

	for _, tpus := range ev.PriceUpdates.TokenPriceUpdates {
		if tpus.SourceToken.IsAddrNone() {
			return nil, fmt.Errorf("invalid source token address: %s", tpus.SourceToken.String())
		}
		if tpus.UsdPerToken == nil || tpus.UsdPerToken.Cmp(big.NewInt(0)) <= 0 {
			return nil, errors.New("nil or non-positive usd per token")
		}
	}

	for _, gpus := range ev.PriceUpdates.GasPriceUpdates {
		if gpus.DataAvailabilityGasPrice == nil || gpus.DataAvailabilityGasPrice.Cmp(big.NewInt(0)) < 0 {
			return nil, fmt.Errorf("nil or negative DataAvailabilityGasPrice: %v", gpus.DataAvailabilityGasPrice)
		}
	}

	return ev, nil
}

// TON only has single Merkle root
func (a *TONAccessor) validateMerkleRoot(merkleRoot *ocr.MerkleRoot) error {
	if merkleRoot.SourceChainSelector == 0 {
		return errors.New("source chain is zero")
	}
	if merkleRoot.MinSeqNr == 0 {
		return errors.New("minSeqNr is zero")
	}
	if merkleRoot.MaxSeqNr == 0 {
		return errors.New("maxSeqNr is zero")
	}
	if merkleRoot.MinSeqNr > merkleRoot.MaxSeqNr {
		return errors.New("minSeqNr is greater than maxSeqNr")
	}
	if len(merkleRoot.MerkleRoot) == 0 {
		return errors.New("empty merkle root")
	}
	if len(merkleRoot.OnRampAddress) == 0 {
		return fmt.Errorf("invalid onramp address: %x", hex.EncodeToString(merkleRoot.OnRampAddress))
	}
	allZero := true
	for _, b := range merkleRoot.OnRampAddress {
		if b != 0 {
			allZero = false
			break
		}
	}
	if allZero {
		return errors.New("onramp address is all zeros")
	}

	return nil
}
