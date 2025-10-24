package lib

import (
	"encoding/json"
	"math/big"
	"reflect"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"

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

var TLBs = MustNewTLBMap([]interface{}{
	Foo{},
	Bar{},
	Baz{},
	wallet.AskToTransfer{},
	mcms.Execute{},
	timelock.ScheduleBatch{},
})

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
		// {
		// 	name:      "Unknown opcode",
		// 	cell:      cell.BeginCell().MustStoreBigInt(big.NewInt(42), 32).EndCell(), // not matching any TLB
		// 	wantType:  "",
		// 	wantMap:   nil,
		// 	expectErr: true,
		// },
		// {
		// 	name:      "Nil cell",
		// 	cell:      nil,
		// 	wantType:  "",
		// 	wantMap:   nil,
		// 	expectErr: true,
		// },
		// {
		// 	name:      "Empty cell",
		// 	cell:      cell.BeginCell().EndCell(),
		// 	wantType:  "",
		// 	wantMap:   nil,
		// 	expectErr: true,
		// },
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
		{
			name: "Decode MCMS Execute > Timelock ScheduleBatch > Op[]s with Bar and Baz in payload",
			cell: mustToCell(mcms.Execute{
				QueryID: 31,
				Op: mcms.Op{
					ChainID:  big.NewInt(-14),
					MultiSig: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
					Nonce:    42,
					To:       address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
					Value:    tlb.MustFromTON("1.5"),
					Data: mustToCell(timelock.ScheduleBatch{
						QueryID: 31,
						Calls: common.SnakeRef[timelock.Call]{
							timelock.Call{
								Target: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
								Value:  tlb.MustFromTON("0.5").Nano(),
								Data: mustToCell(Bar{
									Val: big.NewInt(55555555),
								}),
							},
							timelock.Call{
								Target: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
								Value:  tlb.MustFromTON("1.0").Nano(),
								Data: mustToCell(Baz{
									Val: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
								}),
							},
						},
						Predecessor: big.NewInt(-1),
						Salt:        big.NewInt(1337),
						Delay:       10000,
					}),
				},
			}),
			wantType: "Execute",
			wantMap: map[string]interface{}{
				"QueryID": float64(31),
				"Op": map[string]interface{}{
					"ChainID":  float64(-14),
					"MultiSig": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Nonce":    float64(42),
					"To":       "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Value":    "1500000000",
					"Data": map[string]interface{}{
						"QueryID": float64(31),
						"Calls": []interface{}{
							map[string]interface{}{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  float64(500000000),
								"Data": map[string]interface{}{
									"Val": float64(55555555),
								},
							},
							map[string]interface{}{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  float64(1000000000),
								"Data": map[string]interface{}{
									"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								},
							},
						},
						"Predecessor": float64(-1),
						"Salt":        float64(1337),
						"Delay":       float64(10000),
					},
				},
				"Proof": []any{},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotType, normMap, err := DecodeTLBValToJSON(tt.cell, TLBs)
			require.NoError(t, err, "failed to DecodeTLBValToJSON")

			var gotMap map[string]interface{}
			rawBytes, err := json.Marshal(normMap)
			require.NoError(t, err, "failed to marshal decoded message to JSON")
			err = json.Unmarshal(rawBytes, &gotMap)
			require.NoError(t, err, "failed to unmarshal decoded message JSON to map")

			if (err != nil) != tt.expectErr {
				t.Errorf("DecodeTLBValToJSON() error = %v, expectErr %v", err, tt.expectErr)
			}
			if gotType != tt.wantType {
				t.Errorf("DecodeTLBValToJSON() gotType = %v, want %v", gotType, tt.wantType)
			}
			if !reflect.DeepEqual(gotMap, tt.wantMap) {
				t.Errorf("DecodeTLBValToJSON() gotMap = %v, want %v", gotMap, tt.wantMap)
			}
		})
	}
}
