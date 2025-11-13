package lib

import (
	"encoding/json"
	"math/big"
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

// gotMap = map[Op:map[ChainID:-14 Data:te6cckECCAEAAZoAAagJRxj0AAAAAAAAAB///////////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU5AAAAAAAAJxABAwACAwQBg4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADuaygEAUBg4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHc1lAEAcBg4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALLQXgEAYAEAAAAAIDT7XjAXMPin6lAAAAAAAAAABAExLQCAAG1ut0NpOlEmrw109ciBxs+p6hikJO38s8HS5XatmBtA5iWgAAAAADBwBLAAAAA4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG1BAjK8m MultiSig:EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8 Nonce:42 To:EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8 Value:1500000000] Proof:<nil> QueryID:31],
// want     map[Op:map[ChainID:-14 Data:te6cckECCAEAAZoAAagJRxj0AAAAAAAAAB///////////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU5AAAAAAAAJxABAwACAwQBg4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADuaygEAUBg4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHc1lAEAcBg4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALLQXgEAYAEAAAAAIDT7XjAXMPin6lAAAAAAAAAABAExLQCAAG1ut0NpOlEmrw109ciBxs+p6hikJO38s8HS5XatmBtA5iWgAAAAADBwBLAAAAA4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG1BAjK8m MultiSig:EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8 Nonce:42 To:EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8 Value:1500000000] Proof:<nil> QueryID:31]

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

// Shared complex test case
var testMCMSExecuteCell = mustToCell(mcms.Execute{
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
				timelock.Call{
					Target: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
					Value:  tlb.MustFromTON("1.5").Nano(),
					Data: mustToCell(wallet.AskToTransfer{
						QueryID:     0,
						Amount:      tlb.MustFromTON("0.02"),
						Destination: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
						// CustomPayload:    cell.BeginCell().EndCell(), // default for *cell.Cell
						ForwardPayload:   mustToCell(Foo{Any: mustToCell(Baz{Val: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8")})}),
						ForwardTonAmount: tlb.MustFromTON("0.01"),
					}),
				},
			},
			Predecessor: big.NewInt(-1),
			Salt:        big.NewInt(1337),
			Delay:       10000,
		}),
	},
})

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
			wantType:  "Cell",
			wantMap:   nil,
			expectErr: false,
		},
		{
			name:      "Nil cell",
			cell:      nil,
			wantType:  "<nil>",
			wantMap:   nil,
			expectErr: false,
		},
		{
			name:      "Empty cell",
			cell:      cell.BeginCell().EndCell(),
			wantType:  "Cell",
			wantMap:   nil,
			expectErr: false,
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
		{
			name:     "Decode MCMS Execute > Timelock ScheduleBatch > Op[]s with Bar and Baz in payload",
			cell:     testMCMSExecuteCell,
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
							map[string]interface{}{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  float64(1500000000),
								"Data": map[string]interface{}{
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
							},
						},
						"Predecessor": float64(-1),
						"Salt":        float64(1337),
						"Delay":       float64(10000),
					},
				},
				"Proof": nil,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotType, norm, err := DecodeTLBValToJSON(tt.cell, TLBs)
			require.NoError(t, err, "failed to DecodeTLBValToJSON")

			if tt.wantMap == nil {
				return // value is not a map
			}

			var gotMap map[string]interface{}
			rawBytes, err := json.Marshal(norm)
			require.NoError(t, err, "failed to marshal decoded message to JSON")
			err = json.Unmarshal(rawBytes, &gotMap)
			require.NoError(t, err, "failed to unmarshal decoded message JSON to map")

			if (err != nil) != tt.expectErr {
				t.Errorf("DecodeTLBValToJSON() error = %v, expectErr %v", err, tt.expectErr)
			}
			if gotType != tt.wantType {
				t.Errorf("DecodeTLBValToJSON() gotType = %v, want %v", gotType, tt.wantType)
			}

			require.Equal(t, tt.wantMap, gotMap, "DecodeTLBValToJSON() gotMap = %v, want %v", gotMap, tt.wantMap)
		})
	}
}

// double decoding test (1) domain TLBs or error, (2) context/payload TLBs
func TestDecodeJSONMapFromCellIteratively(t *testing.T) {
	tests := []struct {
		name         string
		cell         *cell.Cell
		tlbsMain     map[uint64]interface{}
		tlbsPayloads map[uint64]interface{}
		wantType     string
		wantMap      map[string]interface{}
		expectErr    bool
	}{
		{
			name: "Decode MCMS Execute > Timelock ScheduleBatch > Ops - payload TLBs available",
			cell: testMCMSExecuteCell,
			tlbsMain: MustNewTLBMap([]interface{}{
				mcms.Execute{},
			}),
			tlbsPayloads: MustNewTLBMap([]interface{}{
				Foo{},
				Bar{},
				Baz{},
				wallet.AskToTransfer{},
				timelock.ScheduleBatch{},
			}),
			wantType: "map[string]interface {}",
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
							map[string]interface{}{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  float64(1500000000),
								"Data": map[string]interface{}{
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
							},
						},
						"Predecessor": float64(-1),
						"Salt":        float64(1337),
						"Delay":       float64(10000),
					},
				},
				"Proof": nil,
			},
		},
		{
			name: "Decode MCMS Execute > Timelock ScheduleBatch > Ops - payload TLBs (some) NOT available",
			cell: testMCMSExecuteCell,
			tlbsMain: MustNewTLBMap([]interface{}{
				mcms.Execute{},
				wallet.AskToTransfer{},
			}),
			tlbsPayloads: MustNewTLBMap([]interface{}{
				Foo{},
				Bar{},
				Baz{},
				timelock.ScheduleBatch{},
			}),
			wantType: "map[string]interface {}",
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
							map[string]interface{}{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  float64(1500000000),
								"Data":   "te6cckEBAgEAZQABcw+KfqUAAAAAAAAAAEATEtAIAAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0DmJaAAAAAAMBAEsAAAADgABtbrdDaTpRJq8NdPXIgcbPqeoYpCTt/LPB0uV2rZgbUNAF680=",
							},
						},
						"Predecessor": float64(-1),
						"Salt":        float64(1337),
						"Delay":       float64(10000),
					},
				},
				"Proof": nil,
			},
		},
		{
			name: "Decode MCMS Execute > Timelock ScheduleBatch > Ops - payload TLBs (most) NOT available",
			cell: testMCMSExecuteCell,
			tlbsMain: MustNewTLBMap([]interface{}{
				mcms.Execute{},
			}),
			tlbsPayloads: MustNewTLBMap([]interface{}{
				Foo{},
				Bar{},
				Baz{},
			}),
			wantType: "map[string]interface {}",
			wantMap: map[string]interface{}{
				"QueryID": float64(31),
				"Op": map[string]interface{}{
					"ChainID":  float64(-14),
					"MultiSig": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Nonce":    float64(42),
					"To":       "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Value":    "1500000000",
					"Data":     "te6cckECCAEAAZYAAaAJRxj0AAAAAAAAAB///////////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU5AAAnEAEDAAIDBAGDgABtbrdDaTpRJq8NdPXIgcbPqeoYpCTt/LPB0uV2rZgbQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAO5rKAQBQGDgABtbrdDaTpRJq8NdPXIgcbPqeoYpCTt/LPB0uV2rZgbQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAdzWUAQBwGDgABtbrdDaTpRJq8NdPXIgcbPqeoYpCTt/LPB0uV2rZgbQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAstBeAQBgAQAAAAAgNPteMBcw+KfqUAAAAAAAAAAEATEtAIAAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0DmJaAAAAAAMHAEsAAAADgABtbrdDaTpRJq8NdPXIgcbPqeoYpCTt/LPB0uV2rZgbUA+cVaY=",
				},
				"Proof": nil,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, norm, err := DecodeTLBValToJSON(tt.cell, tt.tlbsMain)
			require.NoError(t, err, "failed to DecodeTLBValToJSON - tlbs main")

			gotType, norm, err := DecodeTLBValToJSON(norm, tt.tlbsPayloads)
			require.NoError(t, err, "failed to DecodeTLBValToJSON - tlbs payloads")

			var gotMap map[string]interface{}
			rawBytes, err := json.Marshal(norm)
			require.NoError(t, err, "failed to marshal decoded message to JSON")
			err = json.Unmarshal(rawBytes, &gotMap)
			require.NoError(t, err, "failed to unmarshal decoded message JSON to map")

			if (err != nil) != tt.expectErr {
				t.Errorf("DecodeTLBValToJSON() error = %v, expectErr %v", err, tt.expectErr)
			}
			if gotType != tt.wantType {
				t.Errorf("DecodeTLBValToJSON() gotType = %v, want %v", gotType, tt.wantType)
			}

			require.Equal(t, tt.wantMap, gotMap, "DecodeTLBValToJSON() gotMap = %v, want %v", gotMap, tt.wantMap)
		})
	}
}
