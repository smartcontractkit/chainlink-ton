package logpoller

import (
	"encoding/binary"
	"fmt"
	"reflect"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// TopicEvent must expose Topic().
type TopicEvent interface {
	Topic() uint64
}

// Event carries the decoded data.
type Event struct {
	Data    any
	Source  *address.Address
	RawBody *cell.Cell
}

// EventParser knows how to map a topic → Go type.
type EventParser struct {
	topicRegistry map[uint64]reflect.Type
	debug         bool
}

// NewEventParser constructs a parser.
func NewEventParser(debug bool) *EventParser {
	return &EventParser{
		topicRegistry: make(map[uint64]reflect.Type),
		debug:         debug,
	}
}

func (p *EventParser) parseEventFromMessage(ext *tlb.ExternalMessageOut) *Event {
	// topic is low-8 bytes of dst address:
	topic := binary.BigEndian.Uint64(ext.DstAddr.Data()[24:])
	if p.debug {
		fmt.Printf("DEBUG topic=%d\n", topic)
	}
	typ, ok := p.topicRegistry[topic]
	if !ok {
		return nil
	}
	evPtr := reflect.New(typ)
	if err := tlb.LoadFromCell(evPtr.Interface(), ext.Body.BeginParse()); err != nil {
		if p.debug {
			fmt.Printf("DEBUG parse failed: %v\n", err)
		}
		return nil
	}
	return &Event{
		Data:    evPtr.Elem().Interface(),
		Source:  ext.SrcAddr,
		RawBody: ext.Body,
	}
}