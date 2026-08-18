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
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccip/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
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

	// eventNameCCIPMessageSentV1 matches the topic already-deployed OnRamp contracts used
	// before the token-transfer wrapper was added to the event body
	// (onramp.TopicCCIPMessageSentV1). Kept so historical logs stay decodable.
	eventNameCCIPMessageSentV1 = consts.EventNameCCIPMessageSent
	// eventNameCCIPMessageSentV2 matches the topic the OnRamp emits going forward
	// (onramp.TopicCCIPMessageSentV2), carrying the token-transfer wrapper body.
	eventNameCCIPMessageSentV2 = "CCIPMessageSentV2"
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
			eventNameCCIPMessageSentV1,
			eventNameCCIPMessageSentV2,
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

// convertCCIPMessageSentV1 converts a TON-specific legacy CCIPMessageSent event (no
// token-transfer wrapper) to a generic ccipocr3.SendRequestedEvent.
func (a *TONAccessor) convertCCIPMessageSentV1(
	tonEvent *onramp.CCIPMessageSentV1,
) (*ccipocr3.SendRequestedEvent, error) {
	body := tonEvent.Message.Body

	tokenAmounts := make([]ccipocr3.RampTokenAmount, 0, len(body.TokenAmounts))
	for _, ta := range body.TokenAmounts {
		tokenAmounts = append(tokenAmounts, ccipocr3.RampTokenAmount{
			Amount: ccipocr3.NewBigInt(ta.Amount.Nano()),
		})
	}

	return a.buildSendRequestedEvent(
		tonEvent.Message.Header, tonEvent.Message.Sender,
		body.Receiver, body.Data, body.ExtraArgs, body.FeeToken, body.FeeTokenAmount,
		tokenAmounts,
	)
}

// convertCCIPMessageSentV2 converts a TON-specific CCIPMessageSent event (with the
// token-transfer wrapper) to a generic ccipocr3.SendRequestedEvent.
func (a *TONAccessor) convertCCIPMessageSentV2(
	tonEvent *onramp.CCIPMessageSentV2,
) (*ccipocr3.SendRequestedEvent, error) {
	body := tonEvent.Message.Body

	// The current TON flow supports a single token transfer, so the single
	// Body.TokenTransfer applies to every source tokenAmounts entry.
	transfer := body.TokenTransfer
	sourcePoolAddress, err := sourcePoolAddressBytes(transfer.SourcePoolAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to convert source pool address: %w", err)
	}
	destTokenAddress := ccipocr3.UnknownAddress(transfer.DestTokenAddress)
	extraData := cellPayload(transfer.ExtraData)
	destExecData := cellPayload(transfer.DestExecData)

	var tokenAmounts []ccipocr3.RampTokenAmount
	for range transfer.TokenAmounts {
		// The cross-chain amount is the post-fee amount the pool reported
		// (LockOrBurnFinished.destTokenAmount)
		tokenAmounts = append(tokenAmounts, ccipocr3.RampTokenAmount{
			SourcePoolAddress: sourcePoolAddress,
			DestTokenAddress:  destTokenAddress,
			ExtraData:         extraData,
			Amount:            ccipocr3.NewBigInt(transfer.Amount),
			DestExecData:      destExecData,
		})
	}

	return a.buildSendRequestedEvent(
		tonEvent.Message.Header, tonEvent.Message.Sender,
		body.Receiver, body.Data, body.ExtraArgs, body.FeeToken, body.FeeTokenAmount,
		tokenAmounts,
	)
}

// buildSendRequestedEvent maps the fields shared by every CCIPMessageSent version - header,
// sender, receiver/data/extraArgs/fee - into a generic ccipocr3.SendRequestedEvent, given
// the tokenAmounts already converted by the caller's version-specific logic.
func (a *TONAccessor) buildSendRequestedEvent(
	header ocr.RampMessageHeader,
	sender *address.Address,
	receiver common.CrossChainAddress,
	data common.SnakeBytes,
	extraArgs *cell.Cell,
	feeToken *address.Address,
	feeTokenAmount *tlb.Coins,
	tokenAmounts []ccipocr3.RampTokenAmount,
) (*ccipocr3.SendRequestedEvent, error) {
	senderAddr, err := codec.ToRawAddr(sender)
	if err != nil {
		return nil, fmt.Errorf("failed to convert sender address: %w", err)
	}
	feeTokenAddr, err := codec.ToRawAddr(feeToken)
	if err != nil {
		return nil, fmt.Errorf("failed to convert fee token address: %w", err)
	}

	msg := ccipocr3.Message{
		Header: ccipocr3.RampMessageHeader{
			MessageID:           ccipocr3.Bytes32(header.MessageID),
			SourceChainSelector: a.chainSelector,
			DestChainSelector:   ccipocr3.ChainSelector(header.DestChainSelector),
			SequenceNumber:      ccipocr3.SeqNum(header.SequenceNumber),
			Nonce:               header.Nonce,
		},
		Sender:         ccipocr3.UnknownAddress(senderAddr[:]),
		Data:           ccipocr3.Bytes(data),
		Receiver:       ccipocr3.UnknownAddress(receiver),
		ExtraArgs:      ccipocr3.Bytes(extraArgs.ToBOC()),
		FeeToken:       ccipocr3.UnknownAddress(feeTokenAddr[:]),
		FeeTokenAmount: ccipocr3.NewBigInt(feeTokenAmount.Nano()),
		TokenAmounts:   tokenAmounts,
	}
	genericEvent := &ccipocr3.SendRequestedEvent{
		DestChainSelector: msg.Header.DestChainSelector,
		SequenceNumber:    msg.Header.SequenceNumber,
		Message:           msg,
	}
	return genericEvent, nil
}

// sourcePoolAddressBytes converts the TON source pool address to its raw
// (workchain + account id) byte form. A none-address means the message carries no token
// transfer, in which case there is no pool to report.
func sourcePoolAddressBytes(addr *address.Address) (ccipocr3.UnknownAddress, error) {
	if addr == nil || addr.IsAddrNone() {
		return nil, nil
	}
	raw, err := codec.ToRawAddr(addr)
	if err != nil {
		return nil, err
	}
	return ccipocr3.UnknownAddress(raw[:]), nil
}

// cellPayload extracts the raw bytes a payload cell carries. The token-transfer payloads
// (extraData, destExecData) are capped at CCIP_LOCK_OR_BURN_V1_RET_BYTES, so they always
// fit in a single cell's data and never spill into references.
func cellPayload(c *cell.Cell) ccipocr3.Bytes {
	if c == nil {
		return nil
	}
	data := c.BeginParse().MustLoadSlice(c.BitsSize())
	if len(data) == 0 {
		return nil
	}
	return ccipocr3.Bytes(data)
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
