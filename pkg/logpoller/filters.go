package logpoller

import (
	"context"
	"reflect"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

type Filter struct {
	Name    string           // unique
	Address *address.Address // contract
	Topic   uint64           // event topic
}

type filters struct {
	mu               sync.RWMutex
	filtersByName    map[string]Filter
	filtersByAddress map[string]map[uint64]struct{}
	parsersByAddress map[string]*EventParser
}

func newFilters() *filters {
	return &filters{
		filtersByName:    make(map[string]Filter),
		filtersByAddress: make(map[string]map[uint64]struct{}),
		parsersByAddress: make(map[string]*EventParser),
	}
}

func (f *filters) RegisterFilter(ctx context.Context, filter Filter, eventType reflect.Type) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	// by name
	f.filtersByName[filter.Name] = filter
	// index by address→topic
	a := filter.Address.String()
	if f.filtersByAddress[a] == nil {
		f.filtersByAddress[a] = make(map[uint64]struct{})
	}
	f.filtersByAddress[a][filter.Topic] = struct{}{}
	// ensure parser exists
	if f.parsersByAddress[a] == nil {
		f.parsersByAddress[a] = NewEventParser(false)
	}
	f.parsersByAddress[a].topicRegistry[filter.Topic] = eventType
	return nil
}

func (f *filters) UnregisterFilter(ctx context.Context, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	fl, ok := f.filtersByName[name]
	if !ok {
		return nil
	}
	delete(f.filtersByName, name)
	a := fl.Address.String()
	delete(f.filtersByAddress[a], fl.Topic)
	if len(f.filtersByAddress[a]) == 0 {
		delete(f.filtersByAddress, a)
		delete(f.parsersByAddress, a)
	}
	return nil
}

func (f *filters) GetDistinctAddresses(ctx context.Context) []*address.Address {
	f.mu.RLock()
	defer f.mu.RUnlock()
	var out []*address.Address
	for a := range f.filtersByAddress {
		out = append(out, address.MustParseAddr(a))
	}
	return out
}

func (f *filters) MatchingFiltersForTransaction(tx *tlb.Transaction) []Event {
	f.mu.RLock()
	copyParsers := make(map[string]*EventParser, len(f.parsersByAddress))
	for a, p := range f.parsersByAddress {
		copyParsers[a] = p
	}
	f.mu.RUnlock()

	var out []Event
	if tx.IO.Out == nil {
		return out
	}
	msgs, err := tx.IO.Out.ToSlice()
	if err != nil {
		return out
	}
	for _, msg := range msgs {
		if msg.MsgType != tlb.MsgTypeExternalOut {
			continue
		}
		ext := msg.AsExternalOut()
		if ext.Body == nil {
			continue
		}
		a := ext.SrcAddr.String()
		if parser := copyParsers[a]; parser != nil {
			if ev := parser.parseEventFromMessage(ext); ev != nil {
				out = append(out, *ev)
			}
		}
	}
	return out
}
