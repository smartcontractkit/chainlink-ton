package lib

import (
	"math/big"
	"reflect"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Foo struct {
	_   tlb.Magic  `tlb:"#00000001"` //nolint:revive // Ignore opcode tag
	Any *cell.Cell `tlb:"^"`
}

type Bar struct {
	_   tlb.Magic `tlb:"#00000002"` //nolint:revive // Ignore opcode tag
	Val *big.Int  `tlb:"## 32"`
}

type Baz struct {
	_   tlb.Magic        `tlb:"#00000003"` //nolint:revive // Ignore opcode tag
	Val *address.Address `tlb:"addr"`
}

var TLBs = MustNewTLBMap([]interface{}{Foo{}, Bar{}, Baz{}, wallet.AskToTransfer{}})

func mustToCell(v interface{}) *cell.Cell {
	c, err := tlb.ToCell(v)
	if err != nil {
		panic(err)
	}
	return c
}

func TestDecodeJSONMapFromCell(t *testing.T) {
	tests := []struct {
		name      string
		cell      *cell.Cell
		wantType  string
		wantMap   map[string]interface{}
		expectErr bool
	}{
		{
			name:     "Decode Foo",
			cell:     mustToCell(Foo{Any: cell.BeginCell().MustStoreBigInt(big.NewInt(42), 256).EndCell()}),
			wantType: "Foo",
			wantMap: map[string]interface{}{
				"Any": "te6cckEBAQEAIgAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqudxe9A==",
			},
			expectErr: false,
		},
		{
			name:     "Decode Bar",
			cell:     mustToCell(Bar{Val: big.NewInt(1234567890)}),
			wantType: "Bar",
			wantMap: map[string]interface{}{
				"Val": float64(1234567890),
			},
			expectErr: false,
		},
		{
			name:     "Decode Baz",
			cell:     mustToCell(Baz{Val: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8")}),
			wantType: "Baz",
			wantMap: map[string]interface{}{
				"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
			},
			expectErr: false,
		},
		{
			name:      "Unknown opcode",
			cell:      cell.BeginCell().MustStoreBigInt(big.NewInt(42), 32).EndCell(), // not matching any TLB
			wantType:  "",
			wantMap:   nil,
			expectErr: true,
		},
		{
			name:      "Nil cell",
			cell:      nil,
			wantType:  "",
			wantMap:   nil,
			expectErr: true,
		},
		{
			name:      "Empty cell",
			cell:      cell.BeginCell().EndCell(),
			wantType:  "",
			wantMap:   nil,
			expectErr: true,
		},
		{
			name:     "Decode Foo with unknown Any",
			cell:     mustToCell(Foo{Any: cell.BeginCell().MustStoreBigInt(big.NewInt(1), 32).EndCell()}), // not matching any TLB
			wantType: "Foo",
			wantMap: map[string]interface{}{
				"Any": "te6cckEBAQEABgAACAAAAAHgg8T9",
			},
			expectErr: false,
		},
		{
			name:     "Decode Foo with Bar in Any",
			cell:     mustToCell(Foo{Any: mustToCell(Bar{Val: big.NewInt(987654321)})}),
			wantType: "Foo",
			wantMap: map[string]interface{}{
				"Any": map[string]interface{}{
					"Val": float64(987654321),
				},
			},
			expectErr: false,
		},
		{
			name:     "Decode Foo with Baz in Any",
			cell:     mustToCell(Foo{Any: mustToCell(Baz{Val: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8")})}),
			wantType: "Foo",
			wantMap: map[string]interface{}{
				"Any": map[string]interface{}{
					"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
				},
			},
			expectErr: false,
		},
		{
			name:     "Decode Foo with empty cell in Any",
			cell:     mustToCell(Foo{Any: cell.BeginCell().EndCell()}),
			wantType: "Foo",
			wantMap: map[string]interface{}{
				"Any": "te6cckEBAQEAAgAAAEysuc0=",
			},
			expectErr: false,
		},
		{
			name: "Decode Jetton AskToTransfer with Foo in ForwardPayload",
			cell: mustToCell(wallet.AskToTransfer{
				QueryID:     0,
				Amount:      tlb.MustFromTON("0.02"),
				Destination: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
				// CustomPayload:    cell.BeginCell().EndCell(), // default for *cell.Cell
				ForwardPayload:   mustToCell(Foo{Any: mustToCell(Baz{Val: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8")})}),
				ForwardTonAmount: tlb.MustFromTON("0.01"),
			}),
			wantType: "AskToTransfer",
			wantMap: map[string]interface{}{
				"QueryID":       float64(0),
				"Amount":        "20000000",
				"Destination":   "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
				"CustomPayload": "te6cckEBAgEAMwABDzmJaAAAAAAMAQBLAAAAA4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG1B7fNdk",
				"ForwardPayload": map[string]interface{}{
					"Any": map[string]interface{}{
						"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					},
				},
				"ForwardTonAmount":    "10000000",
				"ResponseDestination": "NONE",
			},
			expectErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotType, gotMap, err := DecodeJSONMapFromCell(tt.cell, TLBs)
			if (err != nil) != tt.expectErr {
				t.Errorf("DecodeJSONMapFromCell() error = %v, expectErr %v", err, tt.expectErr)
			}
			if gotType != tt.wantType {
				t.Errorf("DecodeJSONMapFromCell() gotType = %v, want %v", gotType, tt.wantType)
			}
			if !reflect.DeepEqual(gotMap, tt.wantMap) {
				t.Errorf("DecodeJSONMapFromCell() gotMap = %v, want %v", gotMap, tt.wantMap)
			}
		})
	}
}
