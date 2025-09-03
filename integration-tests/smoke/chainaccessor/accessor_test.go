package smoke

import (
	"encoding/binary"
	"fmt"
	"math/big"
	"math/rand/v2"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"go.uber.org/zap/zapcore"

	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/pkg/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/client"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/common/proposalutils"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"
	"github.com/smartcontractkit/chainlink/v2/core/logger"

	ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	tonCommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/chainaccessor"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	inmemorystore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/db/inmemory"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser"

	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	"github.com/xssnick/tonutils-go/address"
)

const ChainSelEVMTest90000001 = 909606746561742123

func Test_TonAccessorEventQueries(t *testing.T) {
	lggr := logger.TestLogger(t)
	ctx := t.Context()

	// create memory env to reuse changesets
	env := memory.NewMemoryEnvironment(t, lggr, zapcore.InfoLevel, memory.MemoryEnvironmentConfig{
		Chains:    1,
		TonChains: 1,
	})

	// get chain selectors
	evmSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyEVM))[0]
	tonChainSelectors := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyTon))
	require.Len(t, tonChainSelectors, 1, "Expected exactly 1 Ton chain")
	chainSelector := tonChainSelectors[0]
	tonChain := env.BlockChains.TonChains()[chainSelector]

	// -- deploy contracts
	cs := ops.DeployChainContractsToTonCS(t, env, chainSelector)
	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	// -- add lane using helper function
	gasPrices := map[uint64]*big.Int{
		evmSelector:   big.NewInt(1e17),
		chainSelector: big.NewInt(1e17), // Add TON chain gas price
	}
	laneCS := ops.AddLaneTONChangesets(&env, chainSelector, evmSelector, chain_selectors.FamilyTon, chain_selectors.FamilyEVM, gasPrices)
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{laneCS})
	require.NoError(t, err, "failed to add lane")

	state, err := tonstate.LoadOnchainState(env)
	require.NoError(t, err)

	// -- start logpoller
	lpCfg := logpoller.DefaultConfigSet
	filterStore := inmemorystore.NewFilterStore()
	opts := &logpoller.ServiceOptions{
		Config:   lpCfg,
		Client:   tonChain.Client,
		Filters:  filterStore,
		TxLoader: account.NewTxLoader(tonChain.Client, lggr, lpCfg.PageSize),
		TxParser: txparser.NewTxParser(lggr, filterStore),
		Store:    inmemorystore.NewLogStore(),
	}
	lp := logpoller.NewService(
		lggr,
		opts,
	)

	// -- initialize tonaccessor
	addrCodec := codec.NewAddressCodec()
	accessor, aerr := chainaccessor.NewTONAccessor(lggr, ccipocr3.ChainSelector(chainSelector), tonChain.Client, lp, addrCodec)
	require.NoError(t, aerr)

	onRampAddr := state[chainSelector].OnRamp

	// -- bind onramp in accessor, event filter will be registered in Sync()
	rawOnRampAddr, err := addrCodec.AddressStringToBytes(onRampAddr.String())
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameOnRamp, rawOnRampAddr)
	require.NoError(t, err)

	// start listening for logs
	require.NoError(t, lp.Start(ctx))
	defer func() {
		require.NoError(t, lp.Close())
	}()

	// TODO: use sendmanytx or highload wallet, otherwise we get 33 exit code(too many actions)
	time.Sleep(5 * time.Second)

	const maxSeqNo = 4
	for seqNo := 0; seqNo < maxSeqNo; seqNo++ {
		t.Log("Sending CCIP message", seqNo)
		extraArgs := onramp.GenericExtraArgsV2{
			GasLimit:                 big.NewInt(100),
			AllowOutOfOrderExecution: false,
		}

		extraArgsCell, err := tlb.ToCell(extraArgs)
		require.NoError(t, err)
		tonSendRequest := ops.TonSendRequest{
			QueryID:   rand.Uint64(),
			Receiver:  tonCommon.CrossChainAddress(make([]byte, 20)),
			Data:      tonCommon.SnakeBytes([]byte("tons of fun")),
			ExtraArgs: extraArgsCell,
			FeeToken:  ops.TonTokenAddr,
		}

		msgCfg := &client.CCIPSendReqConfig{
			SourceChain:  chainSelector,
			DestChain:    evmSelector,
			IsTestRouter: false,
			Sender:       nil,            // For TON, sender is handled by the environment
			Message:      tonSendRequest, // Populate with the CCIP message
			MaxRetries:   3,
		}

		// TODO: send helper args are coupled with core memory environment, can we tidy this?
		ccipState := stateview.CCIPOnChainState{
			TonChains: map[uint64]tonstate.CCIPChainState{
				chainSelector: {
					Router: state[chainSelector].Router,
					OnRamp: state[chainSelector].OnRamp,
				},
			},
		}
		_, err = ops.SendTonRequest(env, ccipState, msgCfg)
		require.NoError(t, err, "failed to send CCIP message")
		time.Sleep(2 * time.Second)
	}

	t.Run("query CCIP events via TonAccessor", func(t *testing.T) {
		// check the latest message is indexed
		require.Eventually(t, func() bool {
			seqNum, err := accessor.LatestMessageTo(ctx, ccipocr3.ChainSelector(evmSelector))
			require.NoError(t, err, "failed to get latest message sequence number")
			return seqNum == ccipocr3.SeqNum(maxSeqNo)
		}, 30*time.Second, 3*time.Second, "log poller did not ingest events correctly in time")

		// check all messages are indexed
		msgs, err := accessor.MsgsBetweenSeqNums(ctx, ccipocr3.ChainSelector(evmSelector), ccipocr3.NewSeqNumRange(0, maxSeqNo))
		require.NoError(t, err, "failed to get latest message sequence number")
		require.Len(t, msgs, maxSeqNo, "expected %d messages, got %d", maxSeqNo, len(msgs))
		require.Equal(t, msgs[0].Header.SequenceNumber, ccipocr3.SeqNum(1))
		require.Equal(t, msgs[maxSeqNo-1].Header.SequenceNumber, ccipocr3.SeqNum(maxSeqNo))

		// range query
		const start, end = 2, 4
		msgs2, err := accessor.MsgsBetweenSeqNums(ctx, ccipocr3.ChainSelector(evmSelector), ccipocr3.NewSeqNumRange(start, end))
		require.NoError(t, err, "failed to get latest message sequence number")
		require.Len(t, msgs2, end-start+1, "expected %d messages, got %d", end-start+1, len(msgs2))
		require.Equal(t, msgs2[0].Header.SequenceNumber, ccipocr3.SeqNum(start))
		require.Equal(t, msgs2[len(msgs2)-1].Header.SequenceNumber, ccipocr3.SeqNum(end))
	})
}

func Test_TonAccessorCommitEventQueries(t *testing.T) {
	lggr := logger.TestLogger(t)
	ctx := t.Context()

	// create memory env to reuse changesets
	env := memory.NewMemoryEnvironment(t, lggr, zapcore.InfoLevel, memory.MemoryEnvironmentConfig{
		Chains:    1,
		TonChains: 1,
	})

	// get chain selectors
	evmSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyEVM))[0]
	tonChainSelectors := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyTon))
	require.Len(t, tonChainSelectors, 1, "Expected exactly 1 Ton chain")
	chainSelector := tonChainSelectors[0]
	tonChain := env.BlockChains.TonChains()[chainSelector]

	// -- deploy contracts (OffRamp contract is sufficient for commit testing)
	cs := ops.DeployChainContractsToTonCS(t, env, chainSelector)
	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	// Follow cs_test.go pattern: configure lanes for proper OffRamp setup
	// This ensures OffRamp knows which source chains it can accept commits from
	tonDefinition := config.TonChainDefinition{
		ConnectionConfig: v1_6.ConnectionConfig{
			RMNVerificationDisabled: true,
			AllowListEnabled:        false,
		},
		Selector: tonChain.Selector,
		GasPrice: big.NewInt(1e17),
		TokenPrices: map[*address.Address]*big.Int{
			ops.TonTokenAddr: big.NewInt(99),
		},
		FeeQuoterDestChainConfig: ops.DefaultFeeQuoterDestChainConfig(true),
		TokenTransferFeeConfigs:  map[uint64]feequoter.UpdateTokenTransferFeeConfig{},
	}
	evmDefinition := config.EVMChainDefinition{
		ChainDefinition: v1_6.ChainDefinition{
			Selector:                 evmSelector,
			GasPrice:                 big.NewInt(1e17),
			TokenPrices:              map[common.Address]*big.Int{},
			FeeQuoterDestChainConfig: v1_6.DefaultFeeQuoterDestChainConfig(true),
			ConnectionConfig: v1_6.ConnectionConfig{
				RMNVerificationDisabled: true,
				AllowListEnabled:        false,
			},
		},
		OnRampVersion: []byte{1, 6, 1},
		OnRamp:        []byte{1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 99},
	}

	// EVM→TON lane (needed for OffRamp to accept EVM commits)
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ops.AddTonLanes{}, config.UpdateTonLanesConfig{
			EVMMCMSConfig: &proposalutils.TimelockConfig{},
			TonMCMSConfig: &proposalutils.TimelockConfig{},
			Lanes: []config.LaneConfig{
				{
					Source:     evmDefinition,
					Dest:       tonDefinition,
					IsDisabled: false,
				},
			},
			TestRouter: false,
		}),
	})
	require.NoError(t, err, "failed to add EVM→TON lane")

	// Configure OCR3 for commit and exec plugins
	deployerAsTransmitter := codec.ToRawAddr(tonChain.WalletAddress)
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ops.SetOCR3Config{}, ops.SetOCR3OffRampConfig{
			RemoteChainSels: []uint64{tonChain.Selector},
			MCMS:            &proposalutils.TimelockConfig{},
			Configs: map[operation.PluginType]operation.OCR3ConfigArgs{
				operation.PluginTypeCCIPCommit: {
					ConfigDigest:                   []byte{1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
					PluginType:                     operation.PluginTypeCCIPCommit,
					F:                              1,
					IsSignatureVerificationEnabled: false,
					Signers: [][]byte{
						{1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1},
						{2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2},
					},
					Transmitters: [][]byte{
						deployerAsTransmitter[:],
						{0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2},
					},
				},
			},
		}),
	})
	require.NoError(t, err, "failed to set ocr3 config")

	state, err := tonstate.LoadOnchainState(env)
	require.NoError(t, err)

	// -- start logpoller
	lpCfg := logpoller.DefaultConfigSet
	filterStore := inmemorystore.NewFilterStore()
	opts := &logpoller.ServiceOptions{
		Config:   lpCfg,
		Client:   tonChain.Client,
		Filters:  filterStore,
		TxLoader: account.NewTxLoader(tonChain.Client, lggr, lpCfg.PageSize),
		TxParser: txparser.NewTxParser(lggr, filterStore),
		Store:    inmemorystore.NewLogStore(),
	}
	lp := logpoller.NewService(lggr, opts)

	// -- initialize tonaccessor
	addrCodec := codec.NewAddressCodec()
	accessor, aerr := chainaccessor.NewTONAccessor(lggr, ccipocr3.ChainSelector(chainSelector), tonChain.Client, lp, addrCodec)
	require.NoError(t, aerr)

	// Sync OffRamp to register event filters
	offRampAddr := state[chainSelector].OffRamp
	rawOffRampAddr, err := addrCodec.AddressStringToBytes(offRampAddr.String())
	require.NoError(t, err)
	err = accessor.Sync(ctx, consts.ContractNameOffRamp, rawOffRampAddr)
	require.NoError(t, err)

	// start listening for logs
	require.NoError(t, lp.Start(ctx))
	defer func() {
		require.NoError(t, lp.Close())
	}()

	time.Sleep(5 * time.Second)

	t.Run("Test CCIP Offramp commit events", func(t *testing.T) {
		// Create commit report with merkle root for EVM→TON messages
		merkleRoot := ocr.MerkleRoot{
			SourceChainSelector: evmSelector, // EVM is the source chain
			OnRampAddress:       tonCommon.CrossChainAddress{0x01, 0x02, 0x03, 0x04, 0x05},
			MinSeqNr:            1,
			MaxSeqNr:            4,
			MerkleRoot:          make([]byte, 32), // 32-byte merkle root
		}

		// Fill merkle root with test data
		for i := range merkleRoot.MerkleRoot {
			merkleRoot.MerkleRoot[i] = byte(i % 256)
		}

		// Create commit report with nil price updates (optional field)
		commitReport := ocr.CommitReport{
			PriceUpdates: nil, // Optional field, matching TypeScript undefined
			MerkleRoots:  []ocr.MerkleRoot{merkleRoot},
		}

		// Use the same config digest as the OCR3 setup (32 bytes)
		configDigest := []byte{1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}

		// Create report context (64 bytes): configDigest + 24 padding + 8 bytes seqNr
		reportContext := make([]byte, 64)
		copy(reportContext[:32], configDigest) // First 32: config digest
		// Bytes 32-55 remain zero (padding)
		seqNr := uint64(1)                                    // Sequence number
		binary.BigEndian.PutUint64(reportContext[56:], seqNr) // Last 8: sequence number

		// Create dummy signatures
		subSig := make([]byte, 32)
		for i := range subSig {
			subSig[i] = byte(i % 256)
		}

		signatures := []ocr.SignatureEd25519{
			{
				R:      subSig,
				S:      subSig,
				Signer: subSig,
			},
			{
				R:      subSig,
				S:      subSig,
				Signer: subSig,
			},
		}

		// Create commit message
		commitMsg := offramp.Commit{
			QueryID:          rand.Uint64(),
			ConfigDigest:     reportContext, // Use full 64-byte report context
			CommitReport:     commitReport,
			SignatureEd25519: signatures,
		}

		// Encode commit message to cell
		commitCell, err := tlb.ToCell(commitMsg)
		require.NoError(t, err)

		// Send commit transaction to OffRamp
		offRampContract := &wrappers.Contract{
			Address: &offRampAddr,
			Client:  &tracetracking.SignedAPIClient{Client: tonChain.Client, Wallet: *tonChain.Wallet},
		}

		receivedMsg, err := offRampContract.SendMessageWait(commitCell, tlb.MustFromTON("0.5"))
		require.NoError(t, err)
		require.Equal(t, 0, int(receivedMsg.ExitCode), "Commit transaction failed with exit code: %d", receivedMsg.ExitCode)

		t.Logf("Commit transaction sent successfully")

		// Follow SendTonRequest pattern: validate all subsequent messages
		err = receivedMsg.WaitForTrace(tonChain.Client)
		require.NoError(t, err, "failed to wait for trace")

		// Validate all outgoing messages following SendTonRequest pattern
		err = validateAllOutgoingMessages(t, tonChain.Client, receivedMsg)
		require.NoError(t, err, "validation of outgoing messages failed")

		// Wait for log poller to index the event
		time.Sleep(5 * time.Second)

		// Debug: Print comprehensive message tracing details
		t.Log("=== RECEIVED MESSAGE DETAILS ===")
		t.Logf("Success: %v, ExitCode: %d", receivedMsg.Success, receivedMsg.ExitCode)

		if receivedMsg.InternalMsg != nil {
			t.Logf("InternalMsg Source: %s", receivedMsg.InternalMsg.SrcAddr.String())
			t.Logf("InternalMsg Dest: %s", receivedMsg.InternalMsg.DstAddr.String())
			t.Logf("Amount: %s TON", tlb.FromNanoTON(receivedMsg.Amount).String())
		} else {
			t.Log("InternalMsg is nil")
		}

		// Debug outgoing internal messages (contract-to-contract calls)
		t.Logf("Outgoing Internal Sent Messages: %d", len(receivedMsg.OutgoingInternalSentMessages))
		for i, msg := range receivedMsg.OutgoingInternalSentMessages {
			if msg.InternalMsg != nil {
				t.Logf("  Sent Message %d: %s -> %s, Amount: %s TON",
					i, msg.InternalMsg.SrcAddr.String(), msg.InternalMsg.DstAddr.String(), tlb.FromNanoTON(msg.Amount).String())
			} else {
				t.Logf("  Sent Message %d: InternalMsg is nil", i)
			}
		}

		t.Logf("Outgoing Internal Received Messages: %d", len(receivedMsg.OutgoingInternalReceivedMessages))
		for i, msg := range receivedMsg.OutgoingInternalReceivedMessages {
			t.Logf("  Received Message %d: Success=%v, ExitCode=%d", i, msg.Success, msg.ExitCode)
			if msg.InternalMsg != nil {
				t.Logf("    From: %s -> To: %s", msg.InternalMsg.SrcAddr.String(), msg.InternalMsg.DstAddr.String())
			} else {
				t.Log("    InternalMsg is nil")
			}
			t.Logf("    External Messages: %d", len(msg.OutgoingExternalMessages))

			for j, extMsg := range msg.OutgoingExternalMessages {
				bodyBits := uint(0)
				if extMsg.Body != nil {
					bodyBits = extMsg.Body.BitsSize()
				}
				t.Logf("      External Message %d: LT=%d, CreatedAt=%d, Body bits=%d",
					j, extMsg.LT, extMsg.CreatedAt, bodyBits)
			}
		}

		t.Logf("OutgoingExternalMessages count: %d", len(receivedMsg.OutgoingExternalMessages))
		for i, extMsg := range receivedMsg.OutgoingExternalMessages {
			bodyBits := uint(0)
			if extMsg.Body != nil {
				bodyBits = extMsg.Body.BitsSize()
			}
			t.Logf("  External message %d: LT=%d, CreatedAt=%d, Body bits=%d",
				i, extMsg.LT, extMsg.CreatedAt, bodyBits)
		}

		// Extract CommitReportAccepted event from the transaction
		err = extractCommitReportAcceptedEvent(t, receivedMsg, merkleRoot)
		require.NoError(t, err, "failed to extract CommitReportAccepted event")

		t.Log("Commit message sent successfully and CommitReportAccepted event extracted")
	})
}

// validateAllOutgoingMessages follows the SendTonRequest pattern to validate all subsequent messages
func validateAllOutgoingMessages(t *testing.T, clientConn *ton.APIClient, msg *tracetracking.ReceivedMessage) error {
	if msg == nil {
		return fmt.Errorf("received message is nil")
	}

	// Collect all messages to process in a queue
	var messagesToProcess []*tracetracking.ReceivedMessage
	messagesToProcess = append(messagesToProcess, msg)

	// Process messages iteratively
	for len(messagesToProcess) > 0 {
		// Get the first message from the queue
		currentMsg := messagesToProcess[0]
		messagesToProcess = messagesToProcess[1:]

		if len(currentMsg.OutgoingInternalReceivedMessages) == 0 {
			continue
		}

		t.Logf("Validating %d outgoing internal messages", len(currentMsg.OutgoingInternalReceivedMessages))

		for i, outMsg := range currentMsg.OutgoingInternalReceivedMessages {
			t.Logf("Outgoing message %d: exit code %v, success: %v, bounced: %v, status: %v",
				i, outMsg.ExitCode, outMsg.Success, outMsg.EmittedBouncedMessage, outMsg.Status())

			// Validate exit code following SendTonRequest pattern
			if outMsg.ExitCode != 0 {
				return fmt.Errorf("outgoing message %d failed with exit code %v", i, outMsg.ExitCode)
			}
			if !outMsg.Success {
				return fmt.Errorf("outgoing message %d was not successful", i)
			}
			if outMsg.EmittedBouncedMessage {
				return fmt.Errorf("outgoing message %d was bounced", i)
			}

			err := outMsg.WaitForTrace(clientConn)
			if err != nil {
				t.Logf("failed to wait for trace for message %d: %v", i, err)
				continue
			}

			// Add this message to the queue for further processing
			messagesToProcess = append(messagesToProcess, outMsg)
		}
	}

	return nil
}

// extractCommitReportAcceptedEvent extracts and validates the CommitReportAccepted event from the transaction
func extractCommitReportAcceptedEvent(t *testing.T, receivedMsg *tracetracking.ReceivedMessage, expectedMerkleRoot ocr.MerkleRoot) error {
	if receivedMsg == nil {
		return fmt.Errorf("received message is nil")
	}

	// direct external messages
	if len(receivedMsg.OutgoingExternalMessages) > 0 {
		t.Logf("Found %d direct outgoing external messages", len(receivedMsg.OutgoingExternalMessages))
		for i, extMsg := range receivedMsg.OutgoingExternalMessages {
			t.Logf("Checking direct external message %d", i)
			if err := parseAndValidateCommitEvent(t, extMsg.Body, expectedMerkleRoot); err == nil {
				return nil
			}
		}
	}

	// check external messages from nested internal messages
	for i, internalMsg := range receivedMsg.OutgoingInternalReceivedMessages {
		if len(internalMsg.OutgoingExternalMessages) > 0 {
			t.Logf("Found %d external messages in internal received message %d", len(internalMsg.OutgoingExternalMessages), i)
			for j, extMsg := range internalMsg.OutgoingExternalMessages {
				t.Logf("Checking nested external message %d", j)
				if err := parseAndValidateCommitEvent(t, extMsg.Body, expectedMerkleRoot); err == nil {
					return nil
				}
			}
		}
	}

	return fmt.Errorf("no CommitReportAccepted event found in transaction trace")
}

// parseAndValidateCommitEvent parses and validates a CommitReportAccepted event from a cell
func parseAndValidateCommitEvent(t *testing.T, eventBody *cell.Cell, expectedMerkleRoot ocr.MerkleRoot) error {
	var commitEvent offramp.CommitReportAccepted
	err := tlb.LoadFromCell(&commitEvent, eventBody.BeginParse())
	if err != nil {
		t.Logf("Failed to parse as CommitReportAccepted event: %v", err)
		return fmt.Errorf("failed to parse CommitReportAccepted event: %w", err)
	}

	t.Logf("Successfully parsed CommitReportAccepted event:")

	// Check if MerkleRoot is present
	if commitEvent.MerkleRoot.SourceChainSelector == 0 {
		t.Logf("  MerkleRoot: nil (price updates only)")
	} else {
		t.Logf("  MerkleRoot:")
		t.Logf("    SourceChainSelector: %d", commitEvent.MerkleRoot.SourceChainSelector)
		t.Logf("    MinSeqNr: %d", commitEvent.MerkleRoot.MinSeqNr)
		t.Logf("    MaxSeqNr: %d", commitEvent.MerkleRoot.MaxSeqNr)
		t.Logf("    MerkleRoot: %x", commitEvent.MerkleRoot.MerkleRoot[:8]) // First 8 bytes

		// Validate the merkle root matches what we sent
		if commitEvent.MerkleRoot.SourceChainSelector != expectedMerkleRoot.SourceChainSelector {
			return fmt.Errorf("merkle root source chain mismatch: got %d, expected %d",
				commitEvent.MerkleRoot.SourceChainSelector, expectedMerkleRoot.SourceChainSelector)
		}
		if commitEvent.MerkleRoot.MinSeqNr != expectedMerkleRoot.MinSeqNr {
			return fmt.Errorf("merkle root MinSeqNr mismatch: got %d, expected %d",
				commitEvent.MerkleRoot.MinSeqNr, expectedMerkleRoot.MinSeqNr)
		}
		if commitEvent.MerkleRoot.MaxSeqNr != expectedMerkleRoot.MaxSeqNr {
			return fmt.Errorf("merkle root MaxSeqNr mismatch: got %d, expected %d",
				commitEvent.MerkleRoot.MaxSeqNr, expectedMerkleRoot.MaxSeqNr)
		}
	}

	// Check PriceUpdates
	t.Logf("  PriceUpdates: present=%v", commitEvent.PriceUpdates.TokenPriceUpdates != nil || commitEvent.PriceUpdates.GasPriceUpdates != nil)

	return nil
}
