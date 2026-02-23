package tracetracking

import (
	"context"
	"errors"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// MsgStatus represents the status of a message in the TON blockchain.
// It can be one of the following:
//   - Received: The message has been received and has outgoing messages, all in
//     Sent state.
//   - Cascading: The message has been received and has outgoing messages, some
//     in Received state.
//   - Finalized: The message has been received and all outgoing messages have
//     been received.
type MsgStatus int

const (
	NotFound MsgStatus = -1
	Received MsgStatus = iota
	Cascading
	Finalized
)

// SentMessage represents a message that has been sent from one contract to another
// in the TON blockchain. It contains information about the internal message,
// the amount transferred, the Lamport time when the message was sent, and the
// forward fees paid by the sender.

type SentMessage struct {
	InternalMsg *tlb.InternalMessage
	Amount      *big.Int
	LamportTime uint64   // Lamport time of sender when emitting the message
	FwdFee      *big.Int // Of sending this message. This is paid by the sender of the message. It is 0 on external messages.
}

// NewSentMessage creates a SentMessage from an internal message.
// It extracts the amount, Lamport time, and forward fees from the internal message
// to create a complete SentMessage representation.
func NewSentMessage(internalMessage *tlb.InternalMessage) SentMessage {
	return SentMessage{
		InternalMsg: internalMessage,
		Amount:      internalMessage.Amount.Nano(),
		LamportTime: internalMessage.CreatedLT,
		FwdFee:      internalMessage.FwdFee.Nano(), // Will be zero if it is an external message
	}
}

// ReceivedMessage represents a message that has been received and processed by a contract
// in the TON blockchain. It contains comprehensive information about both the sending
// and receiving phases of the message, including fees, execution results, and any
// outgoing messages generated during processing.
type ReceivedMessage struct {
	// Sent step

	InternalMsg *tlb.InternalMessage
	Amount      *big.Int
	ExternalMsg *tlb.ExternalMessageIn
	LamportTime uint64   // Lamport time of sender when emitting the message
	ImportFee   *big.Int // Import fee of the message. This is paid by the receiver of the message when calling acceptMessage(). It is 0 on internal messages.
	FwdFee      *big.Int // Of sending this message. This is paid by the sender of the message. It is 0 on external messages.

	// Received step

	StorageFeeCharged                *big.Int                            // Rent due at the moment of sending the message (charged to receiver)
	MsgFeesChargedToSender           *big.Int                            // Forward fees
	TotalActionFees                  *big.Int                            // Fees charged to the sender for sending messages. This + the fwdFee of each outgoing msg forms the total charged in the action phase.
	GasFee                           *big.Int                            // Fees charged to the receiver for processing the message.
	MagicFee                         *big.Int                            // Unknown origin fee
	EmittedBouncedMessage            bool                                // Indicates if the transaction was bounced
	Description                      *tlb.TransactionDescriptionOrdinary // Description of the transaction (if ordinary)
	OutgoingInternalSentMessages     []*SentMessage                      // Internal messages sent as a result of this message
	OutgoingInternalReceivedMessages []*ReceivedMessage                  // Internal messages that have been received by their recipients
	OutgoingExternalMessages         []OutgoingExternalMessages
}

// OutgoingExternalMessages represents external messages sent by a contract,
// typically used for events or notifications that are emitted to external systems.
type OutgoingExternalMessages struct {
	SrcAddr   *address.Address
	DstAddr   *address.Address
	CreatedAt uint32
	LT        uint64
	Body      *cell.Cell
}

// AsString attempts to parse the message body as a string.
// This is commonly used for external messages that contain text data or event information.
// Returns an error if the body cannot be parsed as a string.
func (e *OutgoingExternalMessages) AsString() (string, error) {
	str, err := e.Body.BeginParse().LoadStringSnake()
	if err != nil {
		return "", fmt.Errorf("failed to parse event body: %w", err)
	}
	return str, nil
}

// TotalActionPhaseFees calculates the total fees charged during the action phase,
// including the base action fees and forward fees for all outgoing messages
// (both sent and received). This represents the complete cost of message processing
// and forwarding during transaction execution.
func (m *ReceivedMessage) TotalActionPhaseFees() *big.Int {
	total := big.NewInt(0).Set(m.TotalActionFees)
	for _, sentMessage := range m.OutgoingInternalSentMessages {
		total.Add(total, sentMessage.FwdFee)
	}
	for _, receivedMessage := range m.OutgoingInternalReceivedMessages {
		total.Add(total, receivedMessage.FwdFee)
	}
	return total
}

// Sum calculates the total of multiple big.Int values and returns the result.
// This is a utility function for aggregating fee amounts and other numeric values.
func Sum(values ...*big.Int) *big.Int {
	total := big.NewInt(0)
	for _, v := range values {
		total.Add(total, v)
	}
	return total
}

// TotalTransactionExecutionFee calculates the total fees for executing a transaction,
// excluding storage fees. This includes import fees (for external messages),
// gas fees (compute phase), action phase fees, and any additional fees.
// This represents the complete execution cost for processing the message.
// Excludes the storage fee
func (m *ReceivedMessage) TotalTransactionExecutionFee() *big.Int {
	return Sum(
		m.ImportFee,              // For external messages
		m.GasFee,                 // Compute phase
		m.TotalActionPhaseFees(), // Action phase
		m.MagicFee,               // Somewhere
	)
}

// Status returns the current status of the message based on its outgoing messages.
// Returns Finalized if no outgoing messages exist, Cascading if some outgoing messages
// have been received, or Received if outgoing messages exist but none have been received yet.
func (m *ReceivedMessage) Status() MsgStatus {
	if len(m.OutgoingInternalSentMessages) == 0 {
		return Finalized
	}
	if len(m.OutgoingInternalReceivedMessages) != 0 {
		return Cascading
	}
	return Received
}

// NetCreditResult calculates the net amount credited to the recipient after
// accounting for all outgoing payments. This is the amount received minus
// the total amount sent in outgoing messages.
func (m *ReceivedMessage) NetCreditResult() *big.Int {
	return big.NewInt(0).Sub(m.Amount, m.OutgoingAmount())
}

// OutgoingAmount calculates the total amount sent in all outgoing messages,
// including both sent messages and messages that have been received by their
// recipients. This represents the total outflow from the current message.
func (m *ReceivedMessage) OutgoingAmount() *big.Int {
	base := big.NewInt(0)
	for _, sentMessage := range m.OutgoingInternalSentMessages {
		base.Add(base, sentMessage.Amount)
	}
	for _, receivedMessage := range m.OutgoingInternalReceivedMessages {
		base.Add(base, receivedMessage.Amount)
	}
	return base
}

// MapToReceivedMessage creates a ReceivedMessage from a transaction that represents
// a message being received and processed. It extracts all relevant information
// including fees, execution results, bounced status, and outgoing messages.
//
// The function:
// - Updates the total fees
// - Updates the storage fees collected
// - Updates the status to Received or Finalized if there are no outgoing messages
// - Maps the outgoing messages to the sent messages
// - Updates the bounced status if the transaction was bounced
//
// Returns an error if the transaction cannot be properly parsed.
func MapToReceivedMessage(txOnReceived *tlb.Transaction) (ReceivedMessage, error) {
	var (
		internalMessage *tlb.InternalMessage
		externalMessage *tlb.ExternalMessageIn
		amount          = big.NewInt(0)
		importFee       = big.NewInt(0)
		fwdFee          = big.NewInt(0)
	)
	switch txOnReceived.IO.In.MsgType {
	case tlb.MsgTypeExternalIn:
		externalMessage = txOnReceived.IO.In.AsExternalIn()
		importFee = externalMessage.ImportFee.Nano()
	case tlb.MsgTypeExternalOut:
	case tlb.MsgTypeInternal:
		internalMessage = txOnReceived.IO.In.AsInternal()
		amount = internalMessage.Amount.Nano()
		fwdFee = internalMessage.FwdFee.Nano()
	}
	newVar := txOnReceived.TotalFees.Coins.Nano()
	res := ReceivedMessage{
		InternalMsg:                      internalMessage,
		Amount:                           amount,
		ExternalMsg:                      externalMessage,
		LamportTime:                      txOnReceived.LT,
		ImportFee:                        importFee,
		FwdFee:                           fwdFee,
		MsgFeesChargedToSender:           big.NewInt(0),
		StorageFeeCharged:                big.NewInt(0),
		GasFee:                           big.NewInt(0),
		MagicFee:                         big.NewInt(0).Sub(newVar, importFee),
		EmittedBouncedMessage:            false,
		TotalActionFees:                  big.NewInt(0),
		OutgoingInternalSentMessages:     make([]*SentMessage, 0),
		OutgoingInternalReceivedMessages: make([]*ReceivedMessage, 0),
	}

	// TODO: find magic fee
	// There is a component of the fee I was not being able to identify.
	// tonutils-go provides a tx.TotalFees message that returns all fees charged
	// on sender excluding the fwdFee of the outgoing messages. I have confirmed
	// this two components is the total charged to the receiver of a msg.
	// However, when decomposing the total fee, I seem to be missing a value.
	//   tx.TotalFees > actionFees + storageFee + gasFee
	// I suspect it is the importFee, but the
	//  all fees on sender = tx.IO.Out.map(|m| m.AsInternal().FwdFee ).reduce(+) + tx.TotalFees
	//                     =╰───────────────────── fwdFees ─────────────────────╯+ actionFees +  storageFee  +    gasFee    +  magicFee
	//                     =╰─────────────────────── actionPhaseFees ────────────────────────╯ ╰storagePhase╯ ╰computePhase╯ ╰importFee?╯

	// TODO: handle fine
	// According to documentation: _"Starting from the fourth global version of_
	// _TON, if a "send message" action fails, the account is required to pay_
	// _for processing the cells of the message, referred to as the action_fine_"
	// ```
	// fine_per_cell = floor((cell_price >> 16) / 4)
	// max_cells = floor(remaining_balance / fine_per_cell)
	// action_fine = fine_per_cell * min(max_cells, cells_in_msg);
	// ```
	// I have not seen this in the wild yet, and it is likely it only fails is
	// the msg is malformed, which wont happen using Tact.

	if dsc, ok := txOnReceived.Description.(tlb.TransactionDescriptionOrdinary); ok {
		res.Description = &dsc
		if dsc.BouncePhase != nil {
			if _, ok = dsc.BouncePhase.Phase.(tlb.BouncePhaseOk); ok {
				// transaction was bounced, and coins were returned to sender
				// this can happen mostly on custom contracts
				res.EmittedBouncedMessage = true
			}
		}
		computePhase, ok := dsc.ComputePhase.Phase.(tlb.ComputePhaseVM)
		if ok {
			res.GasFee = computePhase.GasFees.Nano()
			res.MagicFee.Sub(res.MagicFee, res.GasFee)
		}
		if dsc.StoragePhase != nil {
			res.StorageFeeCharged = dsc.StoragePhase.StorageFeesCollected.Nano()
			res.MagicFee.Sub(res.MagicFee, res.StorageFeeCharged)
		}
		if dsc.ActionPhase != nil {
			if dsc.ActionPhase.TotalActionFees != nil {
				res.TotalActionFees = dsc.ActionPhase.TotalActionFees.Nano()
				res.MagicFee.Sub(res.MagicFee, res.TotalActionFees)
			}
		}
	}
	if txOnReceived.IO.Out == nil {
		return res, nil
	}
	outgoingMessages, err := txOnReceived.IO.Out.ToSlice()
	if err != nil {
		return ReceivedMessage{}, fmt.Errorf("failed to get outgoing messages: %w", err)
	}
	if err := res.mapOutgoingMessages(outgoingMessages); err != nil {
		return ReceivedMessage{}, fmt.Errorf("failed to map outgoing messages: %w", err)
	}
	return res, nil
}

// mapOutgoingMessages processes the outgoing TLB messages from a transaction and
// converts them into SentMessages, storing them in OutgoingMessagesSent.
// It also updates the total fees charged to the sender for forwarding messages.
// Both internal and external outgoing messages are handled appropriately.
// Returns an error if an unexpected external in message is encountered.
func (m *ReceivedMessage) mapOutgoingMessages(outgoingMessages []tlb.Message) error {
	m.OutgoingInternalSentMessages = make([]*SentMessage, 0, len(outgoingMessages))
	for _, outgoingMessage := range outgoingMessages {
		switch outgoingMessage.MsgType {
		case tlb.MsgTypeInternal:
			msg := outgoingMessage.AsInternal()
			m.AppendSentMessage(msg)
		case tlb.MsgTypeExternalOut:
			msg := outgoingMessage.AsExternalOut()
			m.AppendEvent(msg)
		case tlb.MsgTypeExternalIn:
			return errors.New("ReceivedMessage should not contain external in messages, only external out messages")
		}
	}
	return nil
}

// AppendEvent adds an external message to the list of outgoing external messages.
// External messages are typically used for events or notifications that are
// emitted by contracts to communicate with external systems.
func (m *ReceivedMessage) AppendEvent(outMsg *tlb.ExternalMessageOut) {
	e := OutgoingExternalMessages{outMsg.SrcAddr, outMsg.DstAddr, outMsg.CreatedAt, outMsg.CreatedLT, outMsg.Body}
	m.OutgoingExternalMessages = append(m.OutgoingExternalMessages, e)
}

// AppendSentMessage adds an outgoing internal message to the list of sent messages
// and updates the total forward fees charged to the sender. This tracks all
// messages that were sent as a result of processing the current message.
func (m *ReceivedMessage) AppendSentMessage(outgoingInternalMessage *tlb.InternalMessage) {
	messageSent := NewSentMessage(outgoingInternalMessage)
	m.OutgoingInternalSentMessages = append(m.OutgoingInternalSentMessages, &messageSent)
	m.MsgFeesChargedToSender.Add(m.MsgFeesChargedToSender, outgoingInternalMessage.FwdFee.Nano())
}

// WaitForOutgoingMessagesToBeReceived waits for all outgoing messages to be
// received by their respective recipients and blocks until completion. It
// subscribes to transactions for each recipient address and matches incoming
// transactions with the sent messages. The OutgoingInternalMessagesReceived
// field is updated with the received messages.
//
// Returns an error if any of the outgoing messages failed to be processed
// or if there are issues with transaction monitoring.
//
// TODO: This could be optimized by grouping outgoing messages by recipient address
func (m *ReceivedMessage) WaitForOutgoingMessagesToBeReceived(ctx context.Context, c ton.APIClientWrapped) error {
	for len(m.OutgoingInternalSentMessages) != 0 {
		sentMessage := m.OutgoingInternalSentMessages[0]
		m.OutgoingInternalSentMessages = m.OutgoingInternalSentMessages[1:]
		transactionsReceived := make(chan *tlb.Transaction)

		// Cancelable context per goroutine to prevent leaks from SubscribeOnTransactions
		subCtx, cancel := context.WithCancel(ctx)
		go c.SubscribeOnTransactions(subCtx, sentMessage.InternalMsg.DstAddr, m.LamportTime, transactionsReceived)

		receivedMessage, err := waitForMatchingMessage(subCtx, transactionsReceived, sentMessage)

		// Cancel context and drain the channel so the SubscribeOnTransactions goroutine
		// can unblock from its bare `channel <- tx` send, reach the `workerCtx.Done()`
		// select, and exit. Without draining, the goroutine leaks forever.
		cancel()
		go func() {
			for tx := range transactionsReceived {
				_ = tx // intentionally draining channel to unblock sender goroutine
			}
		}()

		if err != nil {
			return err
		}
		m.OutgoingInternalReceivedMessages = append(m.OutgoingInternalReceivedMessages, receivedMessage)
	}

	return nil
}

func waitForMatchingMessage(ctx context.Context, transactionsReceived chan *tlb.Transaction, sentMessage *SentMessage) (*ReceivedMessage, error) {
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case rTX, ok := <-transactionsReceived:
			if !ok {
				return nil, errors.New("transaction channel closed")
			}

			if rTX.IO.In != nil && rTX.IO.In.MsgType == tlb.MsgTypeInternal {
				receivedMessage, err := sentMessage.MapToReceivedMessageIfMatches(rTX)
				if err != nil {
					return nil, fmt.Errorf("failed to process incoming message: %w", err)
				}
				if receivedMessage != nil {
					return receivedMessage, nil
				}
			}
		}
	}
}

// MapToReceivedMessageIfMatches checks if a transaction corresponds to the reception
// of this sent message and returns a ReceivedMessage if there's a match. It validates
// that the transaction contains an internal message and that the message details
// (addresses, Lamport time) match the originally sent message.
//
// Returns nil if the transaction doesn't match this sent message, or an error
// if the transaction cannot be processed properly.
//
// TODO: This matching could be more efficient with proper indexing by recipient
// address or other identifiers.
func (m SentMessage) MapToReceivedMessageIfMatches(rTX *tlb.Transaction) (*ReceivedMessage, error) {
	if rTX.IO.In == nil || rTX.IO.In.MsgType != tlb.MsgTypeInternal {
		return nil, fmt.Errorf("transaction is not internal: %s", rTX.Dump())
	}
	incomingMessage := rTX.IO.In.AsInternal()
	if !m.MatchesReceived(incomingMessage) {
		return nil, nil
	}
	receivedMessage, err := MapToReceivedMessage(rTX)
	if err != nil {
		return nil, fmt.Errorf("failed to parse sent message: %w", err)
	}
	return &receivedMessage, nil
}

// MatchesReceived verifies if an incoming message corresponds to this originally
// sent message by comparing source address, destination address, and creation
// Lamport time. This is used to track the lifecycle of messages across the
// TON blockchain network.
//
// Implementation note: This message uses explicit boolean logic rather than
// early returns to facilitate debugging and verification of matching criteria.
func (m SentMessage) MatchesReceived(incomingMessage *tlb.InternalMessage) bool {
	// Implementation note:
	// This could use early returns, but the code was designed with debugging in
	// mind.
	isSameMessage := true
	sentMessage := m.InternalMsg
	if !incomingMessage.SrcAddr.Equals(sentMessage.SenderAddr()) {
		isSameMessage = false
	}
	if !incomingMessage.DstAddr.Equals(sentMessage.DestAddr()) {
		isSameMessage = false
	}
	if incomingMessage.CreatedLT != sentMessage.CreatedLT {
		isSameMessage = false
	}
	return isSameMessage
}

// WaitForTrace waits for the complete execution trace of a message, including
// all outgoing messages and their subsequent outgoing messages recursively.
// This ensures that the entire message cascade has been processed and finalized.
// It modifies the OutgoingInternalMessagesReceived field and returns an error
// if any part of the trace fails to process.
//
// The function returns immediately if the message is already in Finalized state.
// Otherwise, it processes all cascading messages until the entire trace is complete.
func (m *ReceivedMessage) WaitForTrace(ctx context.Context, c ton.APIClientWrapped) error {
	if m.Status() == Finalized {
		return nil
	}

	messagesWithUnconfirmedOutgoingMessages := make([]*ReceivedMessage, 0)
	messagesWithUnconfirmedOutgoingMessages = append(messagesWithUnconfirmedOutgoingMessages, m)

	for len(messagesWithUnconfirmedOutgoingMessages) != 0 {
		cascadingMessage := messagesWithUnconfirmedOutgoingMessages[0]

		messagesWithUnconfirmedOutgoingMessages = messagesWithUnconfirmedOutgoingMessages[1:]
		err := cascadingMessage.WaitForOutgoingMessagesToBeReceived(ctx, c)
		if err != nil {
			return fmt.Errorf("failed to wait for outgoing messages: %w", err)
		}
		messagesWithUnconfirmedOutgoingMessages = append(messagesWithUnconfirmedOutgoingMessages, cascadingMessage.OutgoingInternalReceivedMessages...)
	}
	return nil
}

// StopCondition is a function type that defines a condition to determine when to stop
// traversing the message trace. It takes a parent and current ReceivedMessage as input
// and returns a boolean indicating whether the stop condition has been met. This
// is used in functions like TraceExitCodeWith and TraceSucceededWith to limit the scope
// of the trace analysis based on custom criteria.
type StopCondition func(parent, current *ReceivedMessage) (bool, error)

// NoBound is a default StopCondition that never returns true, meaning that trace
// analysis will continue through the entire message trace.
var NoBound StopCondition = func(_, _ *ReceivedMessage) (bool, error) { return false, nil } // Don't stop, no bound condition

// TraceExitCode returns the first non-success exit code found in this message
// or any of its outgoing internal messages. If all messages succeeded, it returns
// the success exit code.
func (m *ReceivedMessage) TraceExitCode() (tvm.ExitCode, error) {
	return m.TraceExitCodeWith(NoBound)
}

// TraceExitCodeWith returns the first non-success exit code found in this message or any of its
// outgoing internal messages, stopping the search to progress in trace branches where the provided
// boundary condition is met (continues searching other branches).
//
// If all messages within the boundary succeeded, it returns the success exit code.
func (m *ReceivedMessage) TraceExitCodeWith(boundary StopCondition) (tvm.ExitCode, error) {
	if m == nil {
		return 0, errors.New("cannot get trace exit code from nil ReceivedMessage")
	}

	if boundary == nil {
		boundary = NoBound // default to no boundary if nil is provided
	}

	stack := []*ReceivedMessage{m}

	for len(stack) > 0 {
		n := len(stack) - 1
		curr := stack[n]

		stack = stack[:n]
		exitCode, err := curr.ExitCode()
		if err != nil {
			return 0, fmt.Errorf("failed to get exit code: %w", err)
		}
		if exitCode != tvm.ExitCodeSuccess {
			return exitCode, nil
		}

		for i := len(curr.OutgoingInternalReceivedMessages) - 1; i >= 0; i-- {
			msg := curr.OutgoingInternalReceivedMessages[i]

			stop, err := boundary(curr, msg)
			if err != nil {
				return 0, fmt.Errorf("failed to evaluate stop condition: %w", err)
			}
			if stop {
				continue // Skip traversing further in this branch if the stop condition is met
			}

			stack = append(stack, msg)
		}
	}

	return tvm.ExitCodeSuccess, nil
}

func (m *ReceivedMessage) Succeeded() bool {
	if m.Description == nil {
		return false // Expected compute phase
	}
	computePhase, ok := m.Description.ComputePhase.Phase.(tlb.ComputePhaseVM)
	if !ok {
		return false // Expected VM compute phase
	}
	return computePhase.Success
}

func (m *ReceivedMessage) ExitCode() (tvm.ExitCode, error) {
	if m.Description == nil {
		return 0, errors.New("no description in transaction")
	}
	computePhase, ok := m.Description.ComputePhase.Phase.(tlb.ComputePhaseVM)
	if !ok {
		skipped, ok := m.Description.ComputePhase.Phase.(tlb.ComputePhaseSkipped)
		if !ok {
			return 0, fmt.Errorf("compute phase is %T, not a VM phase; cannot extract exit code", m.Description.ComputePhase.Phase)
		}
		switch skipped.Reason.Type {
		case tlb.ComputeSkipReasonNoState:
			return tvm.ExitCodeComputeSkipReasonNoState, nil
		case tlb.ComputeSkipReasonBadState:
			return tvm.ExitCodeComputeSkipReasonBadState, nil
		case tlb.ComputeSkipReasonNoGas:
			return tvm.ExitCodeComputeSkipReasonNoGas, nil
		case tlb.ComputeSkipReasonSuspended:
			return tvm.ExitCodeComputeSkipReasonSuspended, nil
		}
	}
	return tvm.ExitCode(computePhase.Details.ExitCode), nil
}

// TraceSucceeded recursively checks if this message and all its OutgoingInternalMessagesReceived succeeded.
func (m *ReceivedMessage) TraceSucceeded() bool {
	succeeded, _ := m.TraceSucceededWith(NoBound) // ok to ignore error
	return succeeded
}

// TraceSucceededWith recursively checks if this message and all its OutgoingInternalMessagesReceived succeeded,
// stopping the check when the provided boundary condition is met.
func (m *ReceivedMessage) TraceSucceededWith(boundary StopCondition) (bool, error) {
	if !m.Succeeded() {
		return false, nil
	}

	if boundary == nil {
		boundary = NoBound // default to no boundary if nil is provided
	}

	for _, msg := range m.OutgoingInternalReceivedMessages {
		stop, err := boundary(m, msg)
		if err != nil {
			return false, fmt.Errorf("failed to evaluate stop condition: %w", err)
		}
		if stop {
			continue // Skip traversing further in this branch if the stop condition is met
		}

		succeeded, err := msg.TraceSucceededWith(boundary)
		if err != nil {
			return false, fmt.Errorf("failed to check if trace succeeded: %w", err)
		}
		if !succeeded {
			return false, nil
		}
	}
	return true, nil
}
