package poc

import (
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

type ContractEventRegistry struct {
	contracts map[string]*EventParser // contract address -> parser
	debug     bool
}

func NewContractEventRegistry(debug bool) *ContractEventRegistry {
	return &ContractEventRegistry{
		contracts: make(map[string]*EventParser),
		debug:     debug,
	}
}

func (r *ContractEventRegistry) RegisterContractEvents(contractAddr *address.Address, events ...TopicEvent) {
	parser := NewEventParser(r.debug)
	for _, event := range events {
		parser.RegisterEvent(event)
	}
	r.contracts[contractAddr.String()] = parser
}

func (r *ContractEventRegistry) GetRegisteredContracts() []*address.Address {
	var addresses []*address.Address
	for addrStr := range r.contracts {
		addr := address.MustParseAddr(addrStr)
		addresses = append(addresses, addr)
	}
	return addresses
}

type EventParser struct {
	topicRegistry map[uint64]reflect.Type
	debug         bool
}

func NewEventParser(debug bool) *EventParser {
	return &EventParser{
		topicRegistry: make(map[uint64]reflect.Type),
		debug:         debug,
	}
}

func (p *EventParser) RegisterEvent(eventType TopicEvent) {
	p.topicRegistry[eventType.Topic()] = reflect.TypeOf(eventType).Elem()
}

func (r *ContractEventRegistry) ParseEventsFromTransaction(tx *tlb.Transaction) []Event {
	var allEvents []Event

	if tx.IO.Out == nil {
		return allEvents
	}

	messages, err := tx.IO.Out.ToSlice()
	if err != nil {
		return allEvents
	}

	for _, msg := range messages {
		if msg.MsgType != tlb.MsgTypeExternalOut {
			continue
		}

		extMsg := msg.AsExternalOut()
		if extMsg.Body == nil {
			continue
		}

		parser, exists := r.contracts[extMsg.SrcAddr.String()]
		if !exists {
			if r.debug {
				fmt.Printf("DEBUG: No parser registered for contract: %s\n", extMsg.SrcAddr.String())
			}
			continue
		}

		event := parser.parseEventFromMessage(&msg)
		if event != nil {
			allEvents = append(allEvents, *event)
		}
	}

	return allEvents
}

func (p *EventParser) parseEventFromMessage(msg *tlb.Message) *Event {
	if p.debug {
		fmt.Println("=== DEBUG: parseEventFromMessage ===")
	}

	if msg.MsgType != tlb.MsgTypeExternalOut {
		if p.debug {
			fmt.Printf("DEBUG: Not external out message, type: %v\n", msg.MsgType)
		}
		return nil
	}

	extMsg := msg.AsExternalOut()
	if extMsg.Body == nil {
		if p.debug {
			fmt.Println("DEBUG: Body is nil")
		}
		return nil
	}

	if !isExtOutLogBucketAddress(extMsg.DstAddr) {
		if p.debug {
			fmt.Printf("DEBUG: Destination is not ExtOutLogBucket address: %s\n", extMsg.DstAddr.String())
		}
		return nil
	}

	if p.debug {
		fmt.Printf("DEBUG: Source address: %s\n", extMsg.SrcAddr.String())
		fmt.Printf("DEBUG: Dest address: %s\n", extMsg.DstAddr.String())
		fmt.Printf("DEBUG: Body size: %d bits\n", extMsg.Body.BitsSize())
		fmt.Printf("DEBUG: Raw body (BOC hex): %s\n", hex.EncodeToString(extMsg.Body.ToBOC()))
	}

	topic := extractTopicFromAddress(extMsg.DstAddr)
	if p.debug {
		fmt.Printf("DEBUG: Extracted topic: %d\n", topic)
	}

	// Look up event type from registry
	eventType, exists := p.topicRegistry[topic]
	if !exists {
		if p.debug {
			fmt.Printf("DEBUG: Unknown topic: %d\n", topic)
		}
		return nil
	}

	// Create new instance of the event type
	eventPtr := reflect.New(eventType)
	eventInstance := eventPtr.Interface()

	if p.debug {
		fmt.Printf("DEBUG: Parsing as %s\n", eventType.Name())
	}

	// Note: without magic field in Go type we don't have to skip the magic field
	err := tlb.LoadFromCell(eventInstance, extMsg.Body.BeginParse())
	if err != nil {
		if p.debug {
			fmt.Printf("DEBUG: Failed to parse %s: %v\n", eventType.Name(), err)
		}
		return nil
	}

	if p.debug {
		fmt.Printf("DEBUG: Successfully parsed %s: %+v\n", eventType.Name(), eventInstance)
		fmt.Println("DEBUG: Event successfully created")
	}

	return &Event{
		Data:    eventPtr.Elem().Interface(),
		Source:  extMsg.SrcAddr,
		RawBody: extMsg.Body,
	}
}

func extractTopicFromAddress(addr *address.Address) uint64 {
	data := addr.Data()
	topic := binary.BigEndian.Uint64(data[24:])
	fmt.Printf("DEBUG: Address data (hex): %s, extracted topic: %d\n", hex.EncodeToString(data), topic)
	return topic
}

func isExtOutLogBucketAddress(addr *address.Address) bool {
	if addr.BitsLen() != 256 {
		return false
	}

	// external address type (0x01)
	if addr.Type() != address.ExtAddress {
		return false
	}

	data := addr.Data()
	if len(data) != 32 {
		return false
	}

	// first byte should be 0x00 (ExtOutLogBucket prefix)
	if data[0] != 0x00 {
		return false
	}

	return true
}
