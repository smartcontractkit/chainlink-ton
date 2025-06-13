package tonutils

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
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
	Received MsgStatus = iota
	Cascading
	Finalized
)

// Message represents a message in the TON blockchain.
//
// It contains the internal message, the status of the message, the Lamport time
// of the message, the total fees charged to the sender, the storage fees
// collected, the bounced status, and the outgoing messages sent and received.

type SentMessage struct {
	InternalMsg *tlb.InternalMessage
	Amount      *big.Int
	LamportTime uint64   // Lamport time of sender when emitting the message
	FwdFee      *big.Int // Of sending this message. This is paid by the sender of the message. It is 0 on external messages.
}

// MessageSentFromInternalMessage creates a MessageSent from an internal message
func MessageSentFromInternalMessage(internalMessage *tlb.InternalMessage) SentMessage {
	return SentMessage{
		InternalMsg: internalMessage,
		Amount:      internalMessage.Amount.Nano(),
		LamportTime: internalMessage.CreatedLT,
		FwdFee:      internalMessage.FwdFee.Nano(), // Will be zero if it is an external message
	}
}

type ReceivedMessage struct {
	// Sent step

	InternalMsg *tlb.InternalMessage
	Amount      *big.Int
	ExternalMsg *tlb.ExternalMessageIn
	LamportTime uint64   // Lamport time of sender when emitting the message
	ImportFee   *big.Int // Import fee of the message. This is paid by the receiver of the message when calling acceptMessage(). It is 0 on internal messages.
	FwdFee      *big.Int // Of sending this message. This is paid by the sender of the message. It is 0 on external messages.

	// Received step

	StorageFeeCharged                *big.Int           // Rent dued at the moment of sending the message (charged to receiver)
	MsgFeesChargedToSender           *big.Int           // FwdFees
	TotalActionFees                  *big.Int           // Fees charged to the sender for sending messages. This + the fwdFee of each outgoing msg forms the total charged in the action phase.
	GasFee                           *big.Int           // Fees charged to the receiver for processing the message.
	MagicFee                         *big.Int           // Unknown origin fee
	Bounced                          bool               //
	Success                          bool               //
	ExitCode                         ExitCode           //
	OutgoingInternalMessagesSent     []*SentMessage     //
	OutgoingInternalMessagesReceived []*ReceivedMessage //
	OutgoingExternalMessages         []OutgoingExternalMessages
}

type OutgoingExternalMessages struct {
	CreatedAt uint32
	LT        uint64
	Body      *cell.Cell
}

func (e *OutgoingExternalMessages) AsString() (string, error) {
	str, err := e.Body.BeginParse().LoadStringSnake()
	if err != nil {
		return "", fmt.Errorf("failed to parse event body: %s\n", err)
	}
	return str, nil
}

func (m *ReceivedMessage) TotalActionPhaseFees() *big.Int {
	total := m.TotalActionFees
	for _, sentMessage := range m.OutgoingInternalMessagesSent {
		total.Add(total, sentMessage.FwdFee)
	}
	for _, receivedMessage := range m.OutgoingInternalMessagesReceived {
		total.Add(total, receivedMessage.FwdFee)
	}
	return total
}

func Sum(values ...*big.Int) *big.Int {
	total := big.NewInt(0)
	for _, v := range values {
		total.Add(total, v)
	}
	return total
}

// Excludes the storage fee
func (m *ReceivedMessage) TotalTransactionExecutionFee() *big.Int {
	return Sum(
		m.ImportFee,              // For external messages
		m.GasFee,                 // Compute phase
		m.TotalActionPhaseFees(), // Action phase
		m.MagicFee,               // Somewere
	)
}

func (m *ReceivedMessage) Status() MsgStatus {
	if len(m.OutgoingInternalMessagesSent) == 0 {
		return Finalized
	}
	if len(m.OutgoingInternalMessagesReceived) != 0 {
		return Cascading
	}
	return Received
}

func (m *ReceivedMessage) NetCreditResult() *big.Int {
	return big.NewInt(0).Sub(m.Amount, m.OutgoingAmount())
}

func (m *ReceivedMessage) OutgoingAmount() *big.Int {
	base := big.NewInt(0)
	for _, sentMessage := range m.OutgoingInternalMessagesSent {
		base.Add(base, sentMessage.Amount)
	}
	for _, receivedMessage := range m.OutgoingInternalMessagesReceived {
		base.Add(base, receivedMessage.Amount)
	}
	return base
}

// NewMessage creates a new message with the given transaction and internal
// message. It will be in the Received state and will have the outgoing messages
// mapped to the sent messages.
//
// - updates the total fees
// - updates the storage fees collected
// - updates the status to Received or Finalized if there are no outgoing
// messages
// - maps the outgoing messages to the sent messages
// - updates the bounced status if the transaction was bounced
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
		Bounced:                          false,
		Success:                          false,
		ExitCode:                         0,
		TotalActionFees:                  big.NewInt(0),
		OutgoingInternalMessagesSent:     make([]*SentMessage, 0),
		OutgoingInternalMessagesReceived: make([]*ReceivedMessage, 0),
	}

	// TODO: find magic fee
	// There is a component of the fee I was not being able to identify.
	// tonutils-go provides a tx.TotalFees method that returns all fees charged
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
		if dsc.BouncePhase != nil {
			if _, ok = dsc.BouncePhase.Phase.(tlb.BouncePhaseOk); ok {
				// transaction was bounced, and coins were returned to sender
				// this can happen mostly on custom contracts
				res.Bounced = true
			}
		}
		if dsc.CreditPhase != nil {
		}
		computePhase, ok := dsc.ComputePhase.Phase.(tlb.ComputePhaseVM)
		if ok {
			res.Success = computePhase.Success
			res.ExitCode = ExitCode(computePhase.Details.ExitCode)
			res.GasFee = computePhase.GasFees.Nano()
			res.MagicFee.Sub(res.MagicFee, res.GasFee)
		}
		if dsc.StoragePhase != nil {
			if dsc.StoragePhase.StorageFeesDue != nil {
			}
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
		return res, fmt.Errorf("failed to get outgoing messages: %w", err)
	}
	res.mapOutgoingMessages(outgoingMessages)
	return res, nil
}

// mapOutgoingMessages maps the outgoing tlb messages to SentMessages, storing
// them into OutgoingMessagesSent and updates the total fees charged to the
// sender
func (m *ReceivedMessage) mapOutgoingMessages(outgoingMessages []tlb.Message) {
	m.OutgoingInternalMessagesSent = make([]*SentMessage, 0, len(outgoingMessages))
	for _, outgoingMessage := range outgoingMessages {
		switch outgoingMessage.MsgType {
		case tlb.MsgTypeInternal:
			outgoingInternalMessage := outgoingMessage.AsInternal()
			m.AppendSentMessage(outgoingInternalMessage)
		case tlb.MsgTypeExternalOut:
			outgoingExternalMessage := outgoingMessage.AsExternalOut()
			m.AppendEvent(outgoingExternalMessage)
		}
	}
}

func (m *ReceivedMessage) AppendEvent(outMsg *tlb.ExternalMessageOut) {
	e := OutgoingExternalMessages{outMsg.CreatedAt, outMsg.CreatedLT, outMsg.Body}
	m.OutgoingExternalMessages = append(m.OutgoingExternalMessages, e)
}

// AppendSentMessage appends the outgoing message to the list of sent messages
// and updates the total fees charged to the sender
func (r *ReceivedMessage) AppendSentMessage(outgoingInternalMessage *tlb.InternalMessage) {
	messageSent := MessageSentFromInternalMessage(outgoingInternalMessage)
	r.OutgoingInternalMessagesSent = append(r.OutgoingInternalMessagesSent, &messageSent)
	r.MsgFeesChargedToSender.Add(r.MsgFeesChargedToSender, outgoingInternalMessage.FwdFee.Nano())
}

// WaitForOutgoingMessagesToBeReceived waits for the outgoing messages to be
// received and will block until all outgoing messages are received. It will
// update the OutgoingInternalMessagesReceived field of the message, and will
// return an error if any of the outgoing messages failed to be processed.
//
// TODO: This could be optimized if the message stored the outgoing messages
// grouped by address
func (m *ReceivedMessage) WaitForOutgoingMessagesToBeReceived(ac *ApiClient) error {
	outgoingMessagesSentQueue := AsQueue(&m.OutgoingInternalMessagesSent)
	for {
		sentMessage, ok := outgoingMessagesSentQueue.Pop()
		if !ok {
			break
		}
		transactionsReceived := ac.SubscribeToTransactions(*sentMessage.InternalMsg.DstAddr, m.LamportTime)

		var receivedMessage *ReceivedMessage
		for rTX := range transactionsReceived {
			if rTX.IO.In != nil && rTX.IO.In.MsgType == tlb.MsgTypeInternal {
				var err error
				receivedMessage, err = sentMessage.MapToReceivedMessageIfMatches(rTX)
				if err != nil {
					return fmt.Errorf("failed to process incoming message: %w", err)
				}
				if receivedMessage != nil {
					break
				}
			}
		}
		m.OutgoingInternalMessagesReceived = append(m.OutgoingInternalMessagesReceived, receivedMessage)
	}

	return nil
}

// MapToReceivedMessageIfMatches checks if the tx and incomming message information
// matches itself and returns a MessageReceived accordingly.
//
// It will return an error if the transaction is not an internal message or if
// the incoming message does not match the sent message.
//
// TODO: Of course this would be more efficient with a map, but I haven't found
// an identifier that can be used as a key. Maybe it can be sharded by the
// recipient address at least.
func (m SentMessage) MapToReceivedMessageIfMatches(rTX *tlb.Transaction) (*ReceivedMessage, error) {
	if rTX.IO.In == nil || rTX.IO.In.MsgType != tlb.MsgTypeInternal {
		return nil, fmt.Errorf("transaction is not internal: %s", rTX.Dump())
	}
	incommingMessage := rTX.IO.In.AsInternal()
	if !m.MatchesReceived(incommingMessage) {
		return nil, nil
	}
	receivedMessage, err := MapToReceivedMessage(rTX)
	if err != nil {
		return nil, fmt.Errorf("failed to parse sent message: %w", err)
	}
	return &receivedMessage, nil
}

// MatchesReceived checks if the incoming message is the same as the message
// originally sent (m)
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

// WaitForTrace waits for all outgoing messages to be received and all their
// outgoing messages to be received recursively. It will modify the
// OutgoingInternalMessagesReceived field of the message, and will return an
// error if any of the outgoing messages failed to be processed.
func (m *ReceivedMessage) WaitForTrace(ac *ApiClient) error {
	if m.Status() == Finalized {
		return nil
	}

	messagesWithUnconfirmedOutgoingMessages := NewEmptyQueue[*ReceivedMessage]()
	messagesWithUnconfirmedOutgoingMessages.Push(m)

	for {
		cascadingMessage, ok := messagesWithUnconfirmedOutgoingMessages.Pop()
		if !ok {
			break
		}
		err := cascadingMessage.WaitForOutgoingMessagesToBeReceived(ac)
		if err != nil {
			return fmt.Errorf("failed to wait for outgoing messages: %w", err)
		}
		messagesWithUnconfirmedOutgoingMessages.PushAll(cascadingMessage.OutgoingInternalMessagesReceived...)
	}
	return nil
}
