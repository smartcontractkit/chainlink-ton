package lib_test

import (
	"encoding/json"
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

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

var TLBs = lib.MustNewTLBMap([]any{
	Foo{},
	Bar{},
	Baz{},
	wallet.AskToTransfer{},
	mcms.Execute{},
	timelock.ScheduleBatch{},
})

func mustToCell(v any) *cell.Cell {
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
					Value:  tlb.MustFromTON("0.5"),
					Data: mustToCell(Bar{
						Val: big.NewInt(55555555),
					}),
				},
				timelock.Call{
					Target: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
					Value:  tlb.MustFromTON("1.0"),
					Data: mustToCell(Baz{
						Val: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
					}),
				},
				timelock.Call{
					Target: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
					Value:  tlb.MustFromTON("1.5"),
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
			Predecessor: tlbe.NewUint256(big.NewInt(1111)),
			Salt:        tlbe.NewUint256(big.NewInt(1337)),
			Delay:       10000,
		}),
	},
})

func TestDecodeJSONMapFromCell(t *testing.T) {
	tests := []struct {
		name      string
		cell      *cell.Cell
		wantType  string
		wantMap   map[string]any
		expectErr bool
	}{
		{
			name:     "Decode Foo",
			cell:     mustToCell(Foo{Any: cell.BeginCell().MustStoreBigInt(big.NewInt(42), 256).EndCell()}),
			wantType: "Foo",
			wantMap: map[string]any{
				"Any": "te6cckEBAQEAIgAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqudxe9A==",
			},
			expectErr: false,
		},
		{
			name:     "Decode Bar",
			cell:     mustToCell(Bar{Val: big.NewInt(1234567890)}),
			wantType: "Bar",
			wantMap: map[string]any{
				"Val": float64(1234567890),
			},
			expectErr: false,
		},
		{
			name:     "Decode Baz",
			cell:     mustToCell(Baz{Val: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8")}),
			wantType: "Baz",
			wantMap: map[string]any{
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
			wantMap: map[string]any{
				"Any": "te6cckEBAQEABgAACAAAAAHgg8T9",
			},
			expectErr: false,
		},
		{
			name:     "Decode Foo with Bar in Any",
			cell:     mustToCell(Foo{Any: mustToCell(Bar{Val: big.NewInt(987654321)})}),
			wantType: "Foo",
			wantMap: map[string]any{
				"Any": map[string]any{
					"Val": float64(987654321),
				},
			},
			expectErr: false,
		},
		{
			name:     "Decode Foo with Baz in Any",
			cell:     mustToCell(Foo{Any: mustToCell(Baz{Val: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8")})}),
			wantType: "Foo",
			wantMap: map[string]any{
				"Any": map[string]any{
					"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
				},
			},
			expectErr: false,
		},
		{
			name:     "Decode Foo with empty cell in Any",
			cell:     mustToCell(Foo{Any: cell.BeginCell().EndCell()}),
			wantType: "Foo",
			wantMap: map[string]any{
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
			wantMap: map[string]any{
				"QueryID":       float64(0),
				"Amount":        "20000000",
				"Destination":   "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
				"CustomPayload": "te6cckEBAgEAMwABDzmJaAAAAAAMAQBLAAAAA4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG1B7fNdk",
				"ForwardPayload": map[string]any{
					"Any": map[string]any{
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
			wantMap: map[string]any{
				"QueryID": float64(31),
				"Op": map[string]any{
					"ChainID":  float64(-14),
					"MultiSig": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Nonce":    float64(42),
					"To":       "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Value":    "1500000000",
					"Data": map[string]any{
						"QueryID": float64(31),
						"Calls": []any{
							map[string]any{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  "500000000",
								"Data": map[string]any{
									"Val": float64(55555555),
								},
							},
							map[string]any{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  "1000000000",
								"Data": map[string]any{
									"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								},
							},
							map[string]any{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  "1500000000",
								"Data": map[string]any{
									"QueryID":       float64(0),
									"Amount":        "20000000",
									"Destination":   "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
									"CustomPayload": "te6cckEBAgEAMwABDzmJaAAAAAAMAQBLAAAAA4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG1B7fNdk",
									"ForwardPayload": map[string]any{
										"Any": map[string]any{
											"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
										},
									},
									"ForwardTonAmount":    "10000000",
									"ResponseDestination": "NONE",
								},
							},
						},
						"Predecessor": float64(1111),
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
			gotType, norm, err := lib.DecodeTLBValToJSON(tt.cell, TLBs)
			require.NoError(t, err, "failed to DecodeTLBValToJSON")

			if tt.wantMap == nil {
				return // value is not a map
			}

			var gotMap map[string]any
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
		tlbsMain     lib.TLBMap
		tlbsPayloads lib.TLBMap
		wantType     string
		wantMap      map[string]any
		expectErr    bool
	}{
		{
			name: "Decode MCMS Execute > Timelock ScheduleBatch > Ops - payload TLBs available",
			cell: testMCMSExecuteCell,
			tlbsMain: lib.MustNewTLBMap([]any{
				mcms.Execute{},
			}),
			tlbsPayloads: lib.MustNewTLBMap([]any{
				Foo{},
				Bar{},
				Baz{},
				wallet.AskToTransfer{},
				timelock.ScheduleBatch{},
			}),
			wantType: "map[string]interface {}",
			wantMap: map[string]any{
				"QueryID": float64(31),
				"Op": map[string]any{
					"ChainID":  float64(-14),
					"MultiSig": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Nonce":    float64(42),
					"To":       "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Value":    "1500000000",
					"Data": map[string]any{
						"QueryID": float64(31),
						"Calls": []any{
							map[string]any{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  "500000000",
								"Data": map[string]any{
									"Val": float64(55555555),
								},
							},
							map[string]any{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  "1000000000",
								"Data": map[string]any{
									"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								},
							},
							map[string]any{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  "1500000000",
								"Data": map[string]any{
									"QueryID":       float64(0),
									"Amount":        "20000000",
									"Destination":   "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
									"CustomPayload": "te6cckEBAgEAMwABDzmJaAAAAAAMAQBLAAAAA4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG1B7fNdk",
									"ForwardPayload": map[string]any{
										"Any": map[string]any{
											"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
										},
									},
									"ForwardTonAmount":    "10000000",
									"ResponseDestination": "NONE",
								},
							},
						},
						"Predecessor": float64(1111),
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
			tlbsMain: lib.MustNewTLBMap([]any{
				mcms.Execute{},
				wallet.AskToTransfer{},
			}),
			tlbsPayloads: lib.MustNewTLBMap([]any{
				Foo{},
				Bar{},
				Baz{},
				timelock.ScheduleBatch{},
			}),
			wantType: "map[string]interface {}",
			wantMap: map[string]any{
				"QueryID": float64(31),
				"Op": map[string]any{
					"ChainID":  float64(-14),
					"MultiSig": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Nonce":    float64(42),
					"To":       "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Value":    "1500000000",
					"Data": map[string]any{
						"QueryID": float64(31),
						"Calls": []any{
							map[string]any{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  "500000000",
								"Data": map[string]any{
									"Val": float64(55555555),
								},
							},
							map[string]any{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  "1000000000",
								"Data": map[string]any{
									"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								},
							},
							map[string]any{
								"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
								"Value":  "1500000000",
								"Data":   "te6cckEBAgEAZQABcw+KfqUAAAAAAAAAAEATEtAIAAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0DmJaAAAAAAMBAEsAAAADgABtbrdDaTpRJq8NdPXIgcbPqeoYpCTt/LPB0uV2rZgbUNAF680=",
							},
						},
						"Predecessor": float64(1111),
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
			tlbsMain: lib.MustNewTLBMap([]any{
				mcms.Execute{},
			}),
			tlbsPayloads: lib.MustNewTLBMap([]any{
				Foo{},
				Bar{},
				Baz{},
			}),
			wantType: "map[string]interface {}",
			wantMap: map[string]any{
				"QueryID": float64(31),
				"Op": map[string]any{
					"ChainID":  float64(-14),
					"MultiSig": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Nonce":    float64(42),
					"To":       "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
					"Value":    "1500000000",
					"Data":     "te6cckECCAEAAUIAAaAJRxj0AAAAAAAAAB8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEVwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU5AAAnEAEDAAIDBAFLgABtbrdDaTpRJq8NdPXIgcbPqeoYpCTt/LPB0uV2rZgbSDuaygEFAUuAAG1ut0NpOlEmrw109ciBxs+p6hikJO38s8HS5XatmBtIdzWUAQcBS4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0iy0F4BBgAQAAAAAgNPteMBcw+KfqUAAAAAAAAAAEATEtAIAAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG0DmJaAAAAAAMHAEsAAAADgABtbrdDaTpRJq8NdPXIgcbPqeoYpCTt/LPB0uV2rZgbUONjwks=",
				},
				"Proof": nil,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, norm, err := lib.DecodeTLBValToJSON(tt.cell, tt.tlbsMain)
			require.NoError(t, err, "failed to DecodeTLBValToJSON - tlbs main")

			gotType, norm, err := lib.DecodeTLBValToJSON(norm, tt.tlbsPayloads)
			require.NoError(t, err, "failed to DecodeTLBValToJSON - tlbs payloads")

			var gotMap map[string]any
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
