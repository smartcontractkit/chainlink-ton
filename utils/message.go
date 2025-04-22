package utils

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
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

type MessageSent struct {
	Msg         *tlb.InternalMessage
	Amount      uint
	LamportTime uint64 // Lamport time of sender when emitting the message
	FwdFee      uint   // Of sending this message. This is paid by the sender of the message. It is 0 on external messages.
}

// MessageSentFromInternalMessage creates a MessageSent from an internal message
func MessageSentFromInternalMessage(internalMessage *tlb.InternalMessage) MessageSent {
	return MessageSent{
		Msg:         internalMessage,
		Amount:      uint(internalMessage.Amount.Nano().Uint64()),
		LamportTime: internalMessage.CreatedLT,
		FwdFee:      uint(internalMessage.FwdFee.Nano().Uint64()), // Will be zero if it is an external message
	}
}

type MessageReceived struct {
	// Sent step

	InternalMsg *tlb.InternalMessage
	Amount      uint
	ExternalMsg *tlb.ExternalMessageIn
	LamportTime uint64 // Lamport time of sender when emitting the message
	ImportFee   uint   // Import fee of the message. This is paid by the receiver of the message when calling acceptMessage(). It is 0 on internal messages.
	FwdFee      uint   // Of sending this message. This is paid by the sender of the message. It is 0 on external messages.

	// Received step

	StorageFeeCharged        uint               // Rent dued at the moment of sending the message (charged to receiver)
	MsgFeesChargedToSender   uint               // FwdFees
	TotalActionFees          uint               // Fees charged to the sender for sending messages. This + the fwdFee of each outgoing msg forms the total charged in the action phase.
	GasFee                   uint               // Fees charged to the receiver for processing the message.
	MagicFee                 uint               // Unknown origin fee
	Bounced                  bool               //
	Success                  bool               //
	ExitCode                 int32              //
	OutgoingMessagesSent     []*MessageSent     //
	OutgoingMessagesReceived []*MessageReceived //
}

func (m *MessageReceived) TotalActionPhaseFees() uint {
	total := m.TotalActionFees
	for _, sentMessage := range m.OutgoingMessagesSent {
		total += sentMessage.FwdFee
	}
	for _, receivedMessage := range m.OutgoingMessagesReceived {
		total += receivedMessage.FwdFee
	}
	return total
}

// Excludes the storage fee
func (m *MessageReceived) TotalTransactionExecutionFee() uint {
	total := m.ImportFee + // For external messages
		m.GasFee + // Compute phase
		m.TotalActionPhaseFees() + // Action phase
		m.MagicFee // Somewere
	return total
}

func (m *MessageReceived) Status() MsgStatus {
	if len(m.OutgoingMessagesSent) == 0 {
		return Finalized
	}
	if len(m.OutgoingMessagesReceived) != 0 {
		return Cascading
	}
	return Received
}

func (m *MessageReceived) NetCreditResult() int {
	return int(m.Amount) - int(m.OutgoingAmount())
}

func (m *MessageReceived) OutgoingAmount() uint {
	base := uint(0)
	for _, sentMessage := range m.OutgoingMessagesSent {
		base += sentMessage.Amount
	}
	for _, receivedMessage := range m.OutgoingMessagesReceived {
		base += receivedMessage.Amount
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
func MapToReceivedMessage(txOnReceived *tlb.Transaction) (MessageReceived, error) {
	fmt.Println("===================\n===================\nMapToReceivedMessage")
	var internalMessage *tlb.InternalMessage
	var externalMessage *tlb.ExternalMessageIn
	amount := uint(0)
	importFee := uint(0)
	fwdFee := uint(0)
	switch txOnReceived.IO.In.MsgType {
	case tlb.MsgTypeExternalIn:
		fmt.Printf("Transaction AsExternalIn: %+v\n", txOnReceived.IO.In.AsExternalIn())
		externalMessage = txOnReceived.IO.In.AsExternalIn()
		importFee = uint(externalMessage.ImportFee.Nano().Uint64())
	case tlb.MsgTypeExternalOut:
		fmt.Printf("Transaction AsExternalOut: %+v\n", txOnReceived.IO.In.AsExternalOut())
	case tlb.MsgTypeInternal:
		fmt.Printf("Transaction AsInternal: %+v\n", txOnReceived.IO.In.AsInternal())
		internalMessage = txOnReceived.IO.In.AsInternal()
		amount = uint(internalMessage.Amount.Nano().Uint64())
		fwdFee = uint(internalMessage.FwdFee.Nano().Uint64())
	}
	fmt.Println("===================")
	fmt.Printf("TX dump: %+v", txOnReceived)
	fmt.Println("===================")
	res := MessageReceived{
		InternalMsg:              internalMessage,
		Amount:                   amount,
		ExternalMsg:              externalMessage,
		LamportTime:              txOnReceived.LT,
		ImportFee:                importFee,
		FwdFee:                   fwdFee,
		MsgFeesChargedToSender:   0,
		StorageFeeCharged:        0,
		GasFee:                   0,
		MagicFee:                 uint(txOnReceived.TotalFees.Coins.Nano().Uint64()) - importFee,
		Bounced:                  false,
		Success:                  false,
		ExitCode:                 0,
		TotalActionFees:          0,
		OutgoingMessagesSent:     make([]*MessageSent, 0),
		OutgoingMessagesReceived: make([]*MessageReceived, 0),
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
			fmt.Printf("Transaction BouncePhase: %+v\n", dsc.BouncePhase)
			if _, ok = dsc.BouncePhase.Phase.(tlb.BouncePhaseOk); ok {
				// transaction was bounced, and coins were returned to sender
				// this can happen mostly on custom contracts
				fmt.Printf("Transaction was bounced\n")
				res.Bounced = true
			}
		}
		if dsc.CreditPhase != nil {
			fmt.Printf("Transaction CreditPhase: %+v\n", dsc.CreditPhase)
		}
		computePhase, ok := dsc.ComputePhase.Phase.(tlb.ComputePhaseVM)
		fmt.Printf("Transaction ComputePhase: %+v\n", computePhase)
		if ok {
			res.Success = computePhase.Success
			res.ExitCode = computePhase.Details.ExitCode
			res.GasFee = uint(computePhase.GasFees.Nano().Uint64())
			res.MagicFee -= res.GasFee
		}
		if dsc.StoragePhase != nil {
			fmt.Printf("Transaction StoragePhase.Status: %+v\n", dsc.StoragePhase.StatusChange)
			fmt.Printf("Transaction StoragePhase.StorageFeesCollected: %d\n", dsc.StoragePhase.StorageFeesCollected.Nano())
			if dsc.StoragePhase.StorageFeesDue != nil {
				fmt.Printf("Transaction StoragePhase.StorageFeesDue: %d\n", dsc.StoragePhase.StorageFeesDue.Nano())
			}
			res.StorageFeeCharged = uint(dsc.StoragePhase.StorageFeesCollected.Nano().Uint64())
			res.MagicFee -= res.StorageFeeCharged
		}
		if dsc.ActionPhase != nil {
			fmt.Printf("Transaction ActionPhase: %+v\n", dsc.ActionPhase)
			if dsc.ActionPhase.TotalActionFees != nil {
				res.TotalActionFees = uint(dsc.ActionPhase.TotalActionFees.Nano().Uint64())
				res.MagicFee -= res.TotalActionFees
			}
		}
	}
	if txOnReceived.IO.Out == nil {
		fmt.Printf("Transaction has no outgoing messages\n")
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
func (m *MessageReceived) mapOutgoingMessages(outgoingMessages []tlb.Message) {
	m.OutgoingMessagesSent = make([]*MessageSent, 0, len(outgoingMessages))
	for _, outgoingMessage := range outgoingMessages {
		fmt.Printf("- MsgType %+v\n", outgoingMessage.MsgType)
		if outgoingMessage.MsgType == tlb.MsgTypeInternal {
			outgoingInternalMessage := outgoingMessage.AsInternal()
			fmt.Printf("Outgoing message: %+v\n", outgoingInternalMessage)
			m.AppendSentMessage(outgoingInternalMessage)
		}
	}
}

// AppendSentMessage appends the outgoing message to the list of sent messages
// and updates the total fees charged to the sender
func (r *MessageReceived) AppendSentMessage(outgoingInternalMessage *tlb.InternalMessage) {
	messageSent := MessageSentFromInternalMessage(outgoingInternalMessage)
	r.OutgoingMessagesSent = append(r.OutgoingMessagesSent, &messageSent)
	r.MsgFeesChargedToSender += uint(outgoingInternalMessage.FwdFee.Nano().Uint64())
}

// WaitForOutgoingMessagesToBeReceived waits for the outgoing messages to be received and
// returns the list of new sent messagses. It will block until all outgoing
// messages are received.
//
// TODO: This could be optimized if the message stored the outgoing messages
// grouped by address
func (m *MessageReceived) WaitForOutgoingMessagesToBeReceived(ac *ApiClient) error {
	fmt.Printf("===================\nWaitForOutgoingMessagesToBeReceived\n")
	outgoingMessagesSentQueue := AsQueue(&m.OutgoingMessagesSent)
	for {
		sentMessage, ok := outgoingMessagesSentQueue.Pop()
		if !ok {
			fmt.Printf("No outgoing messages\n")
			break
		}
		fmt.Printf("Waiting for outgoing message to arrive: %s\n- - - - - - - - - - - -\n", sentMessage.Msg.Dump())
		transactionsReceived := ac.SubscribeToTransactions(*sentMessage.Msg.DstAddr, m.LamportTime)

		var receivedMessage *MessageReceived
		for rTX := range transactionsReceived {
			fmt.Printf("Transaction arrived: %s\n", rTX.Dump())
			if rTX.IO.In != nil && rTX.IO.In.MsgType == tlb.MsgTypeInternal {
				fmt.Printf("Transaction is internal\n")
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
		m.OutgoingMessagesReceived = append(m.OutgoingMessagesReceived, receivedMessage)
		fmt.Println("----------------------------")
	}

	return nil
}

// MapToReceivedMessageIfMatches checks if the tx and incomming message infirmation
// matches itself and returns a MessageReceived accordingly. It returns true if the message
// matched
//
// TODO: Of course this would be more efficient with a map, but I haven't found
// an identifier that can be used as a key. Maybe it can be sharded by the
// recipient address at least.
func (m MessageSent) MapToReceivedMessageIfMatches(rTX *tlb.Transaction) (*MessageReceived, error) {
	if rTX.IO.In == nil || rTX.IO.In.MsgType != tlb.MsgTypeInternal {
		return nil, fmt.Errorf("transaction is not internal: %s", rTX.Dump())
	}
	incommingMessage := rTX.IO.In.AsInternal()
	if !m.MatchesReceived(incommingMessage) {
		return nil, nil
	}
	fmt.Printf("Incomming message matches sent message\n")
	receivedMessage, err := MapToReceivedMessage(rTX)
	if err != nil {
		return nil, fmt.Errorf("failed to parse sent message: %w", err)
	}
	return &receivedMessage, nil
}

// MatchesReceived checks if the incoming message is the same as the message
// originally sent (m)
func (m MessageSent) MatchesReceived(incommingMessage *tlb.InternalMessage) bool {
	// Implementation note:
	// This could use early returns, but the code was designed with debugging in
	// mind.
	isSameMessage := true
	sentMessage := m.Msg
	if !incommingMessage.SrcAddr.Equals(sentMessage.SenderAddr()) {
		fmt.Printf("IsSameMessage: Transaction arrived from a different source address: expected %s, got %s\n", sentMessage.SenderAddr().StringRaw(), incommingMessage.SrcAddr.StringRaw())
		isSameMessage = false
	}
	if !incommingMessage.DstAddr.Equals(sentMessage.DestAddr()) {
		fmt.Printf("IsSameMessage: Transaction arrived to a different destination address: expected %s, got %s\n", sentMessage.DestAddr().StringRaw(), incommingMessage.DstAddr.StringRaw())
		isSameMessage = false
	}
	if !(incommingMessage.CreatedLT == sentMessage.CreatedLT) {
		fmt.Printf("IsSameMessage: Transaction arrived to with a different LT: expected %d, got %d\n", m.LamportTime, incommingMessage.CreatedLT)
		isSameMessage = false
	}
	return isSameMessage
}
