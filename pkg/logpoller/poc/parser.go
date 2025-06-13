package poc

import "github.com/xssnick/tonutils-go/tlb"

func ParseEventsFromTransaction(tx *tlb.Transaction) []Event {
	var container EventContainer

	var events []Event

	if tx.IO.Out == nil {
		return events
	}

	messages, err := tx.IO.Out.ToSlice()
	if err != nil {
		return events
	}

	for _, msg := range messages {
		event := parseEventFromMessage(&msg, container)
		if event != nil {
			events = append(events, *event)
		}
	}

	return events
}

func parseEventFromMessage(msg *tlb.Message, container EventContainer) *Event {
	if msg.MsgType != tlb.MsgTypeExternalOut {
		return nil
	}

	extMsg := msg.AsExternalOut()
	if !extMsg.DstAddr.IsAddrNone() {
		return nil
	}

	if extMsg.Body == nil {
		return nil
	}
	body := extMsg.Body
	srcAddr := extMsg.SrcAddr

	err := tlb.LoadFromCell(&container, body.BeginParse())
	if err != nil {
		return nil
	}

	return &Event{
		Data:    container.Event,
		Source:  srcAddr,
		RawBody: body,
	}
}
