package resolvers_test

import (
	"encoding/json"
	"math/big"
	"reflect"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/resolvers"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

	resolversd "github.com/smartcontractkit/chainlink-ton/deployment/pkg/codec/resolvers"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
)

func must[E any](out E, err error) E {
	if err != nil {
		panic(err)
	}

	return out
}

type fakeContractProvider struct{}

func (f fakeContractProvider) GetContract(meta opston.ContractMetadata) (opston.CompiledContract, error) {
	switch meta.Key() {
	case "testpkg@1.0.0:Foo":
		cell := cell.BeginCell().MustStoreInt(1, 32).EndCell()
		return opston.CompiledContract{Metadata: meta, Code: cell}, nil
	default:
		cell := cell.BeginCell().MustStoreInt(1337, 32).EndCell()
		return opston.CompiledContract{Metadata: meta, Code: cell}, nil
	}
}

func TestResolvingSendMessagesInputs(t *testing.T) {

	testCases := []struct {
		name    string
		input   map[string]any
		want    opston.SendMessagesInput
		wantErr error
	}{
		{
			name: "should resolve ownable2step.TransferOwnership msg",
			input: map[string]any{
				"messages": []any{
					map[string]any{
						"bounce":  false,
						"dstAddr": address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001"),
						"amount":  "0",
						"body": map[string]any{
							"resolver": "codec.resolvers.msg-envelope",
							"data": map[string]any{
								"contract": "com.chainlink.ton.lib.access.Ownable",
								"type":     "TransferOwnership",
								"opcode":   "0xf21b7da1",
								"payload": map[string]any{
									"QueryID":  663255246267367818,
									"NewOwner": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
								},
							},
						},
					},
				},
				"plan": false,
			},
			want: opston.SendMessagesInput{
				Messages: []opston.InternalMessage[any]{
					{
						Bounce:  false,
						DstAddr: address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001"),
						Amount:  tlb.MustFromTON("0"),
						Body: codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: "com.chainlink.ton.lib.access.Ownable",
								Opcode:   0xf21b7da1,
								TypeName: "TransferOwnership",
								GoType:   reflect.TypeOf(&ownable2step.TransferOwnership{}),
							},
							Value: &ownable2step.TransferOwnership{
								QueryID:  663255246267367818,
								NewOwner: address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ"),
							},
						},
					},
				},
				Plan: false,
			},
		},
		{
			name: "should resolve multiple ownable2step.TransferOwnership msgs",
			input: map[string]any{
				"messages": []any{
					map[string]any{
						"bounce":  false,
						"dstAddr": address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001"),
						"amount":  "0",
						"body": map[string]any{
							"resolver": "codec.resolvers.msg-envelope",
							"data": map[string]any{
								"contract": "com.chainlink.ton.lib.access.Ownable",
								"type":     "TransferOwnership",
								"opcode":   "0xf21b7da1",
								"payload": map[string]any{
									"QueryID":  663255246267367818,
									"NewOwner": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
								},
							},
						},
					},
					map[string]any{
						"bounce":  false,
						"dstAddr": address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000002").String(),
						"amount":  "0",
						"body": map[string]any{
							"resolver": "codec.resolvers.msg-envelope",
							"data": map[string]any{
								"contract": "com.chainlink.ton.lib.access.Ownable",
								"type":     "TransferOwnership",
								"opcode":   "0xf21b7da1",
								"payload": map[string]any{
									"QueryID":  663255246267367818,
									"NewOwner": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
								},
							},
						},
					},
				},
				"plan": false,
			},
			want: opston.SendMessagesInput{
				Messages: []opston.InternalMessage[any]{
					{
						Bounce:  false,
						DstAddr: address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001"),
						Amount:  tlb.MustFromTON("0"),
						Body: codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: "com.chainlink.ton.lib.access.Ownable",
								Opcode:   0xf21b7da1,
								TypeName: "TransferOwnership",
								GoType:   reflect.TypeOf(&ownable2step.TransferOwnership{}),
							},
							Value: &ownable2step.TransferOwnership{
								QueryID:  663255246267367818,
								NewOwner: address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ"),
							},
						},
					},
					{
						Bounce:  false,
						DstAddr: address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000002"),
						Amount:  tlb.MustFromTON("0"),
						Body: codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: "com.chainlink.ton.lib.access.Ownable",
								Opcode:   0xf21b7da1,
								TypeName: "TransferOwnership",
								GoType:   reflect.TypeOf(&ownable2step.TransferOwnership{}),
							},
							Value: &ownable2step.TransferOwnership{
								QueryID:  663255246267367818,
								NewOwner: address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ"),
							},
						},
					},
				},
				Plan: false,
			},
		},
		{
			name: "should resolve a deploy message (state init) + ownable2step.TransferOwnership msg",
			input: map[string]any{
				"messages": []any{
					map[string]any{
						"bounce":  false,
						"dstAddr": address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001"),
						"amount":  "0",
						"body": map[string]any{
							"resolver": "codec.resolvers.msg-envelope",
							"data": map[string]any{
								"contract": "com.chainlink.ton.lib.access.Ownable",
								"type":     "TransferOwnership",
								"opcode":   "0xf21b7da1",
								"payload": map[string]any{
									"QueryID":  663255246267367818,
									"NewOwner": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
								},
							},
						},
						"stateInit": map[string]any{
							"code": map[string]any{
								"resolver": "codec.resolvers.contract-meta-to-code-cell",
								"data": map[string]any{
									"package": "testpkg",
									"version": "1.0.0",
									"id":      "Foo",
								},
							},
							"data": nil, // TODO: add "codec.resolvers.contract-data-to-cell",
						},
					},
				},
				"plan": false,
			},
			want: opston.SendMessagesInput{
				Messages: []opston.InternalMessage[any]{
					{
						Bounce:  false,
						DstAddr: address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001"),
						Amount:  tlb.MustFromTON("0"),
						Body: codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: "com.chainlink.ton.lib.access.Ownable",
								Opcode:   0xf21b7da1,
								TypeName: "TransferOwnership",
								GoType:   reflect.TypeOf(&ownable2step.TransferOwnership{}),
							},
							Value: &ownable2step.TransferOwnership{
								QueryID:  663255246267367818,
								NewOwner: address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ"),
							},
						},
						StateInit: &opston.StateInit{
							Code: cell.BeginCell().MustStoreInt(1, 32).EndCell(),
							Data: nil,
						},
					},
				},
				Plan: false,
			},
		},
		{
			name: "should resolve a MCMS Execute + Timelock ScheduleBatch message (with a few calls)",
			input: map[string]any{
				"messages": []any{
					map[string]any{
						"bounce":  false,
						"dstAddr": address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001"),
						"amount":  "0",
						"body": map[string]any{
							"resolver": "codec.resolvers.msg-envelope",
							"data": map[string]any{
								"contract": "com.chainlink.ton.mcms.MCMS",
								"type":     "Execute",
								"opcode":   "0x9b9ce96a",
								"payload": map[string]any{
									"QueryID": float64(31),
									"Op": map[string]any{
										"ChainID":  float64(-14),
										"MultiSig": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
										"Nonce":    float64(42),
										"To":       "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
										"Value":    "1500000000",
										"Data": map[string]any{
											"resolver": "codec.resolvers.msg-envelope-to-cell",
											"data": map[string]any{
												"contract": "com.chainlink.ton.mcms.Timelock",
												"type":     "ScheduleBatch",
												"opcode":   "0x094718f4",
												"payload": map[string]any{
													"QueryID": float64(31),
													"Calls":   []any{
														// map[string]any{
														// 	"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
														// 	"Value":  "500000000",
														// 	"Data": map[string]any{
														// 		"Val": float64(55555555),
														// 	},
														// },
														// map[string]any{
														// 	"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
														// 	"Value":  "1000000000",
														// 	"Data": map[string]any{
														// 		"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
														// 	},
														// },
														// map[string]any{
														// 	"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
														// 	"Value":  "1500000000",
														// 	"Data": map[string]any{
														// 		"QueryID":       float64(0),
														// 		"Amount":        "20000000",
														// 		"Destination":   "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
														// 		"CustomPayload": "te6cckEBAgEAMwABDzmJaAAAAAAMAQBLAAAAA4AAbW63Q2k6USavDXT1yIHGz6nqGKQk7fyzwdLldq2YG1B7fNdk",
														// 		"ForwardPayload": map[string]any{
														// 			"Any": map[string]any{
														// 				"Val": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
														// 			},
														// 		},
														// 		"ForwardTonAmount":    "10000000",
														// 		"ResponseDestination": "NONE",
														// 	},
														// },
													},
													"Predecessor": float64(1111),
													"Salt":        float64(1337),
													"Delay":       float64(10000),
												},
											},
											"Proof": nil,
										},
									},
								},
							},
						},
					},
				},
				"plan": false,
			},
			want: opston.SendMessagesInput{
				Messages: []opston.InternalMessage[any]{
					{
						Bounce:  false,
						DstAddr: address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001"),
						Amount:  tlb.MustFromTON("0"),
						Body: codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: "com.chainlink.ton.mcms.MCMS",
								Opcode:   0xf21b7da1,
								TypeName: "Execute",
								GoType:   reflect.TypeOf(&mcms.Execute{}),
							},
							Value: &mcms.Execute{
								QueryID: 31,
								Op: mcms.Op{
									ChainID:  big.NewInt(-14),
									MultiSig: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
									Nonce:    42,
									To:       address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
									Value:    tlb.MustFromTON("1.5"),
									Data: must(tlb.ToCell(timelock.ScheduleBatch{
										QueryID:     31,
										Calls:       nil,
										Predecessor: tlbe.NewUint256(big.NewInt(1111)),
										Salt:        tlbe.NewUint256(big.NewInt(1337)),
										Delay:       10000,
									})),
								},
							},
						},
					},
				},
				Plan: false,
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			registry := codec.NewResolverRegistry(
				codec.NewTypedResolver(resolvers.NewMsgEnvelopeResolver(bindings.Registry)),
				codec.NewTypedResolver(resolvers.NewMsgEnvelopeToCellResolver(bindings.Registry)),
				codec.NewTypedResolver(resolversd.NewContractToCellResolver(fakeContractProvider{})),
			)

			resolved, err := registry.Resolve(tc.input)
			require.NoError(t, err, "resolver execution")

			resolvedJSON, err := json.Marshal(resolved)
			require.NoError(t, err, "marshal resolved input")

			var actual opston.SendMessagesInput
			require.NoError(t, json.Unmarshal(resolvedJSON, &actual), "unmarshal into SendMessagesInput")

			// TODO: envelope Value fields are lost on marshal/unmarshal, need to load again for comparison
			for i := range actual.Messages {
				require.NoError(t, actual.Messages[i].Body.LoadDecoded(bindings.Registry), "load decoded message body")

				// regenerate cell from Value for comparison
				tc.want.Messages[i].Body.Cell = must(tlb.ToCell(tc.want.Messages[i].Body.Value))

				// compare cell hashes to avoid comparing cell objects directly
				require.Equal(t, tc.want.Messages[i].Body.Cell.Hash(), actual.Messages[i].Body.Cell.Hash(), "message body cell hash mismatch")

				tc.want.Messages[i].Body.Cell = nil
				actual.Messages[i].Body.Cell = nil

				require.NotEmpty(t, actual.Messages[i].Body.Payload, "message body payload should be populated after LoadDecoded")
				// zero out payloads for comparison
				tc.want.Messages[i].Body.Payload = nil
				actual.Messages[i].Body.Payload = nil

				// compare state init hashes (if present) to avoid comparing cell objects directly
				if tc.want.Messages[i].StateInit != nil {
					require.Equal(
						t,
						must(tlb.ToCell(tlb.StateInit{
							Code: tc.want.Messages[i].StateInit.Code,
							Data: tc.want.Messages[i].StateInit.Data,
						})).Hash(),
						must(tlb.ToCell(tlb.StateInit{
							Code: actual.Messages[i].StateInit.Code,
							Data: actual.Messages[i].StateInit.Data,
						})).Hash(),
						"state init cell hash mismatch",
					)
				}
				// zero out state init for comparison
				tc.want.Messages[i].StateInit = nil
				actual.Messages[i].StateInit = nil
			}

			require.Equal(t, tc.want, actual, "resolved input mismatch")
		})
	}

}
