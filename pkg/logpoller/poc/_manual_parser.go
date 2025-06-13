// TODO: remove, manual bit manipulation is not needed
func parseEventFromMessage(msg *tlb.Message, config testutils.TestConfig) *Event {
	if msg.MsgType != tlb.MsgTypeExternalOut {
		return nil
	}

	extMsg := msg.AsExternalOut()
	if !extMsg.DstAddr.IsAddrNone() {
		return nil
	}

	return parseEventFromBody(extMsg.Body, extMsg.SrcAddr, config)
}

func parseEventFromBody(body *cell.Cell, srcAddr *address.Address, config testutils.TestConfig) *Event {
	bodySlice := body.BeginParse()

	if bodySlice.BitsLeft() < 16 {
		return nil
	}

	structOpCode, err := bodySlice.LoadUInt(16)
	if err != nil {
		return nil
	}

	switch structOpCode {
	case config.CounterIncrementEventOpCode:
		return parseCounterIncrementEvent(bodySlice, srcAddr, body)

	case config.CounterResetEventOpCode:
		return parseCounterResetEvent(bodySlice, srcAddr, body)

	default:
		return nil
	}
}

func parseCounterIncrementEvent(bodySlice *cell.Slice, srcAddr *address.Address, rawBody *cell.Cell) *Event {
	event := &Event{
		EventType: "counter_increment",
		RawBody:   rawBody,
		Data:      make(map[string]interface{}),
	}

	if srcAddr != nil {
		event.Data["source_address"] = srcAddr.String()
	}

	if bodySlice.BitsLeft() >= 32 {
		timestamp, err := bodySlice.LoadUInt(32)
		if err == nil {
			event.Data["timestamp"] = timestamp
		}
	}

	if bodySlice.BitsLeft() >= 32 {
		newValue, err := bodySlice.LoadUInt(32)
		if err == nil {
			event.Data["new_value"] = newValue
		}
	}

	if bodySlice.BitsLeft() >= 267 {
		addr, err := bodySlice.LoadAddr()
		if err == nil && addr != nil {
			event.Data["triggered_by"] = addr.String()
		}
	}

	event.Data["raw_hex"] = hex.EncodeToString(rawBody.ToBOC())
	return event
}

func parseCounterResetEvent(bodySlice *cell.Slice, srcAddr *address.Address, rawBody *cell.Cell) *Event {
	event := &Event{
		EventType: "counter_reset",
		RawBody:   rawBody,
		Data:      make(map[string]interface{}),
	}

	if srcAddr != nil {
		event.Data["source_address"] = srcAddr.String()
	}

	if bodySlice.BitsLeft() >= 32 {
		timestamp, err := bodySlice.LoadUInt(32)
		if err == nil {
			event.Data["timestamp"] = timestamp
		}
	}

	if bodySlice.BitsLeft() >= 267 {
		addr, err := bodySlice.LoadAddr()
		if err == nil && addr != nil {
			event.Data["reset_by"] = addr.String()
		}
	}

	event.Data["raw_hex"] = hex.EncodeToString(rawBody.ToBOC())
	return event
}
