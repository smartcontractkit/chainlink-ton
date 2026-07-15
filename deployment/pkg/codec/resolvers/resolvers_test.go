package resolvers_test

import (
	"context"
	"encoding/json"
	"math/big"
	"reflect"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/resolvers"

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

func (f fakeContractProvider) GetContract(ctx context.Context, meta opston.ContractMetadata) (opston.CompiledContract, error) {
	switch meta.Key() {
	case "testpkg@1.0.0:Foo":
		cell := cell.BeginCell().MustStoreInt(1, 32).EndCell()
		return opston.CompiledContract{Metadata: meta, Code: cell}, nil
	default:
		cell := cell.BeginCell().MustStoreInt(1337, 32).EndCell()
		return opston.CompiledContract{Metadata: meta, Code: cell}, nil
	}
}

type Foo struct {
	_   tlb.Magic  `tlb:"#00000001" json:"-"` //nolint:revive // Ignore opcode tag
	Any *cell.Cell `tlb:"^"`
}

type Bar struct {
	_   tlb.Magic `tlb:"#00000002" json:"-"` //nolint:revive // Ignore opcode tag
	Val *big.Int  `tlb:"## 32"`
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
						"dstAddr": address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001").String(),
						"amount":  "0",
						"body": map[string]any{
							"resolver": "codec.resolvers.msg-envelope",
							"data": map[string]any{
								"contract": bindings.TypeOwnable,
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
						Body: &codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: bindings.TypeOwnable,
								Opcode:   0xf21b7da1,
								TypeName: "TransferOwnership",
								GoType:   reflect.TypeFor[*ownable2step.TransferOwnership](),
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
						"dstAddr": address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001").String(),
						"amount":  "0",
						"body": map[string]any{
							"resolver": "codec.resolvers.msg-envelope",
							"data": map[string]any{
								"contract": bindings.TypeOwnable,
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
								"contract": bindings.TypeOwnable,
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
						Body: &codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: bindings.TypeOwnable,
								Opcode:   0xf21b7da1,
								TypeName: "TransferOwnership",
								GoType:   reflect.TypeFor[*ownable2step.TransferOwnership](),
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
						Body: &codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: bindings.TypeOwnable,
								Opcode:   0xf21b7da1,
								TypeName: "TransferOwnership",
								GoType:   reflect.TypeFor[*ownable2step.TransferOwnership](),
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
			name: "should resolve router.RMNOwnableMessage[AcceptOwnership] msg",
			input: map[string]any{
				"messages": []any{
					map[string]any{
						"bounce":  false,
						"dstAddr": address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001").String(),
						"amount":  "0",
						"body": map[string]any{
							"resolver": "codec.resolvers.msg-envelope",
							"data": map[string]any{
								"contract": bindings.TypeRouter,
								"type":     "RMNOwnableMessage",
								"opcode":   "0xaf7a9ac6",
								"payload": map[string]any{
									"Content": map[string]any{
										"resolver": "codec.resolvers.msg-envelope",
										"data": map[string]any{
											"contract": bindings.TypeOwnable,
											"type":     "AcceptOwnership",
											"opcode":   "0xf9e29e4a",
											"payload": map[string]any{
												"QueryID": 42,
											},
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
						Body: &codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: bindings.TypeRouter,
								Opcode:   0xaf7a9ac6,
								TypeName: "RMNOwnableMessage",
								GoType:   reflect.TypeFor[*router.RMNOwnableMessage[ownable2step.AcceptOwnership]](),
							},
							Value: router.RMNOwnableMessage[ownable2step.AcceptOwnership]{
								Content: &codec.MessageEnvelope[ownable2step.AcceptOwnership]{
									Metadata: codec.MessageMeta{
										Contract: bindings.TypeOwnable,
										Opcode:   0xf9e29e4a,
										TypeName: "AcceptOwnership",
										GoType:   reflect.TypeFor[ownable2step.AcceptOwnership](),
									},
									Value: ownable2step.AcceptOwnership{
										QueryID: 42,
									},
								},
							},
						},
					},
				},
				Plan: false,
			},
		},

		{
			name: "should resolve router.RMNOwnableMessage[TransferOwnership] msg",
			input: map[string]any{
				"messages": []any{
					map[string]any{
						"bounce":  false,
						"dstAddr": address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001").String(),
						"amount":  "0",
						"body": map[string]any{
							"resolver": "codec.resolvers.msg-envelope",
							"data": map[string]any{
								"contract": bindings.TypeRouter,
								"type":     "RMNOwnableMessage",
								"opcode":   "0xaf7a9ac6",
								"payload": map[string]any{
									"Content": map[string]any{
										"resolver": "codec.resolvers.msg-envelope",
										"data": map[string]any{
											"contract": bindings.TypeOwnable,
											"type":     "TransferOwnership",
											"opcode":   "0xf21b7da1",
											"payload": map[string]any{
												"QueryID":  42,
												"NewOwner": "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ",
											},
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
						Body: &codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: bindings.TypeRouter,
								Opcode:   0xaf7a9ac6,
								TypeName: "RMNOwnableMessage",
								GoType:   reflect.TypeFor[*router.RMNOwnableMessage[ownable2step.TransferOwnership]](),
							},
							Value: router.RMNOwnableMessage[ownable2step.TransferOwnership]{
								Content: &codec.MessageEnvelope[ownable2step.TransferOwnership]{
									Metadata: codec.MessageMeta{
										Contract: bindings.TypeOwnable,
										Opcode:   0xf21b7da1,
										TypeName: "TransferOwnership",
										GoType:   reflect.TypeFor[ownable2step.TransferOwnership](),
									},
									Value: ownable2step.TransferOwnership{
										QueryID:  42,
										NewOwner: address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ"),
									},
								},
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
								"contract": bindings.TypeOwnable,
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
									"package": "testpkg@1.0.0",
									"id":      "Foo",
								},
							},
							"data": map[string]any{
								"resolver": "codec.resolvers.contract-data-to-cell",
								"contract": bindings.TypeTimelock,
								"data": map[string]any{
									"ID":                       42,
									"MinDelay":                 0,
									"Timestamps":               []any{},
									"BlockedFnSelectorsLen":    0,
									"BlockedFnSelectors":       []any{},
									"ExecutorRoleCheckEnabled": true,
									"OpPendingInfo": map[string]any{
										"ValidAfter":            0,
										"OpFinalizationTimeout": 0,
										"OpPendingID":           0,
										"OpPendingCalls":        tlbe.NewEmptyDict[*tlbe.Uint256, bool](),
									},
									"RBAC": map[string]any{
										"Roles": []any{},
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
						Body: &codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: bindings.TypeOwnable,
								Opcode:   0xf21b7da1,
								TypeName: "TransferOwnership",
								GoType:   reflect.TypeFor[*ownable2step.TransferOwnership](),
							},
							Value: &ownable2step.TransferOwnership{
								QueryID:  663255246267367818,
								NewOwner: address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ"),
							},
						},
						StateInit: &opston.StateInit{
							Code: cell.BeginCell().MustStoreInt(1, 32).EndCell(),
							Data: must(tlb.ToCell(timelock.EmptyDataFrom(42))),
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
								"contract": bindings.TypeMCMS,
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
												"contract": bindings.TypeTimelock,
												"type":     "ScheduleBatch",
												"opcode":   "0x094718f4",
												"payload": map[string]any{
													"QueryID": float64(31),
													"Calls": []any{
														map[string]any{
															"Target": map[string]any{
																"resolver": "codec.resolvers.address-ref-to-ton-addr",
																"data": map[string]any{
																	"type":      "RBACTimelock",
																	"qualifier": "RMNMCMS",
																},
															},
															"Value": "500000000",
															"Data": must(
																tlb.ToCell(Foo{
																	Any: must(tlb.ToCell(Bar{Val: big.NewInt(42)})),
																}),
															),
														},
														map[string]any{
															"Target": "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
															"Value":  "1000000000",
															"Data":   must(tlb.ToCell(Bar{Val: big.NewInt(42)})),
														},
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
						Body: &codec.MessageEnvelope[any]{
							Metadata: codec.MessageMeta{
								Contract: bindings.TypeMCMS,
								Opcode:   0x9b9ce96a,
								TypeName: "Execute",
								GoType:   reflect.TypeFor[*mcms.Execute](),
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
										QueryID: 31,
										Calls: []timelock.Call{
											{
												Target: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
												Value:  tlb.MustFromTON("0.5"),
												Data:   must(tlb.ToCell(Foo{Any: must(tlb.ToCell(Bar{Val: big.NewInt(42)}))})),
											},
											{
												Target: address.MustParseAddr("EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8"),
												Value:  tlb.MustFromTON("1.0"),
												Data:   must(tlb.ToCell(Bar{Val: big.NewInt(42)})),
											},
										},
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
			selector := uint64(13879075125137744094) // TON Localnet chain selector
			ds := cldfds.NewMemoryDataStore()
			err := ds.AddressRefStore.Add(cldfds.AddressRef{
				Address:       "EQADa3W6G0nSiTV4a6euRA42fU9QxSEnb-WeDpcrtWzA2jM8",
				ChainSelector: selector,
				Qualifier:     "RMNMCMS",
				Type:          bindings.ShortTimelock,
				Version:       semver.MustParse("1.0.0"),
			})
			require.NoError(t, err)

			registry := codec.NewResolverRegistry(
				codec.NewTypedResolver(resolvers.NewMsgEnvelopeResolver(bindings.Registry)),
				codec.NewTypedResolver(resolvers.NewMsgEnvelopeToCellResolver(bindings.Registry)),
				codec.NewTypedResolver(resolvers.NewContractDataToCellResolver(bindings.Registry)),
				codec.NewTypedResolver(resolversd.NewContractToCellResolver(fakeContractProvider{})),
				codec.NewTypedResolver(resolversd.NewTonAddrResolver(selector, ds.Seal())),
			)

			resolved, err := registry.Resolve(tc.input)
			require.NoError(t, err, "resolver execution")

			resolvedJSON, err := json.Marshal(resolved)
			require.NoError(t, err, "marshal resolved input")

			var actual opston.SendMessagesInput
			require.NoError(t, json.Unmarshal(resolvedJSON, &actual), "unmarshal into SendMessagesInput")

			// TODO: envelope Value fields are lost on marshal/unmarshal, need to load again for comparison
			for i := range actual.Messages {
				// compare cell hashes to avoid comparing cell objects directly
				// Notice: we do this b/c slight mismatch in Cell serialization refs: ([]*cell.Cell) <nil> vs {}
				a := must(tc.want.Messages[i].ToMessage())
				b := must(actual.Messages[i].ToMessage())

				t.Logf("WANTED: %+v\n", tc.want.Messages[i].Body)
				t.Logf("ACTUAL: %+v\n", actual.Messages[i].Body)

				require.Equal(t, a.Payload().Hash(), b.Payload().Hash(), "message body cell hash mismatch")
				// zero out Body for comparison
				tc.want.Messages[i].Body = &codec.MessageEnvelope[any]{}
				actual.Messages[i].Body = &codec.MessageEnvelope[any]{}

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
