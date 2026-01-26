package ccipton

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/rs/zerolog"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccip/consts"
	ccipocr3common "github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	tonseqs "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	tonlogpoller "github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	tonlploader "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"
	tonlptypes "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	tonlpquery "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
	tonlpstore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ccip/deployment/utils"

	tonops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

type SourceDestPair struct {
	SourceChainSelector uint64
	DestChainSelector   uint64
}

type AnyMsgSentEvent struct {
	SequenceNumber uint64
	// RawEvent contains the raw event depending on the chain:
	//  EVM:   *onramp.OnRampCCIPMessageSent
	//  Aptos: module_onramp.CCIPMessageSent
	RawEvent any
}

func (m *CCIP16TON) SendMessage(ctx context.Context, src, dest uint64, fields any, opts any) error {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Sending CCIP message")
	a := &tonseqs.TonAdapter{}
	routerAddr, err := a.GetRouterAddress(m.e.DataStore, src)
	if err != nil {
		return fmt.Errorf("failed to get router address: %w", err)
	}
	fqAddr, err := a.GetFQAddress(m.e.DataStore, src)
	if err != nil {
		return fmt.Errorf("failed to get router address: %w", err)
	}
	addrCodec := codec.NewAddressCodec()
	rawRouter, err := addrCodec.AddressBytesToString(routerAddr)
	if err != nil {
		return fmt.Errorf("failed to convert TON address to bytes: %w", err)
	}
	routerContractAddress, err := address.ParseAddr(rawRouter)
	if err != nil {
		return fmt.Errorf("failed to parse router address: %w", err)
	}
	rawFq, err := addrCodec.AddressBytesToString(fqAddr)
	if err != nil {
		return fmt.Errorf("failed to convert TON address to bytes: %w", err)
	}
	fqContractAddress, err := address.ParseAddr(rawFq)
	if err != nil {
		return fmt.Errorf("failed to parse router address: %w", err)
	}
	receiver := common.LeftPadBytes(m.e.BlockChains.EVMChains()[dest].DeployerKey.From.Bytes(), 32)
	extraArgs := onramp.GenericExtraArgsV2{
		GasLimit:                 big.NewInt(1000000),
		AllowOutOfOrderExecution: true,
	}
	extraArgsCell, err := tlb.ToCell(extraArgs)
	if err != nil {
		return fmt.Errorf("failed to serialize extra args: %w", err)
	}
	msg := router.CCIPSend{
		QueryID:           rand.Uint64(),
		DestChainSelector: dest,
		Receiver:          receiver,
		Data:              []byte("hello eoa"),
		TokenAmounts:      nil,
		FeeToken:          tvm.TonTokenAddr,
		ExtraArgs:         extraArgsCell,
	}
	onchainState := state.CCIPChainState{
		FeeQuoter: *fqContractAddress,
		Router:    *routerContractAddress,
	}
	_, rawEvent, err := tonops.SendCCIPMessage(*m.e, onchainState, src, msg)
	if err != nil {
		return fmt.Errorf("failed to send CCIP message: %w", err)
	}
	event := rawEvent.(onramp.CCIPMessageSent)
	sourceDest := SourceDestPair{SourceChainSelector: src, DestChainSelector: dest}
	m.MsgSentEvents = append(m.MsgSentEvents, &AnyMsgSentEvent{
		SequenceNumber: event.Message.Header.SequenceNumber,
		RawEvent:       event.Message,
	})
	m.ExpectedSeqNumRange[sourceDest] = ccipocr3common.SeqNumRange{
		ccipocr3common.SeqNum(m.MsgSentEvents[0].SequenceNumber),
		ccipocr3common.SeqNum(m.MsgSentEvents[0].SequenceNumber)}
	m.ExpectedSeqNumExec[sourceDest] = append(
		m.ExpectedSeqNumExec[sourceDest],
		event.Message.Header.SequenceNumber)

	return nil
}

func (m *CCIP16TON) GetExpectedNextSequenceNumber(ctx context.Context, from, to uint64) (uint64, error) {
	_ = zerolog.Ctx(ctx)
	sourceDest := SourceDestPair{SourceChainSelector: from, DestChainSelector: to}
	seqRange, ok := m.ExpectedSeqNumRange[sourceDest]
	if !ok {
		return 0, fmt.Errorf("no expected sequence number range for source-dest pair %v", sourceDest)
	}
	return uint64(seqRange.End()), nil
}

type CommitReportTracker struct {
	seenMessages map[uint64]map[uint64]bool
}

func NewCommitReportTracker(sourceChainSelector uint64, seqNrs ccipocr3common.SeqNumRange) CommitReportTracker {
	seenMessages := make(map[uint64]map[uint64]bool)
	seenMessages[sourceChainSelector] = make(map[uint64]bool)

	for i := seqNrs.Start(); i <= seqNrs.End(); i++ {
		seenMessages[sourceChainSelector][uint64(i)] = false
	}
	return CommitReportTracker{seenMessages: seenMessages}
}

func (c *CommitReportTracker) visitCommitReport(sourceChainSelector uint64, minSeqNr uint64, maxSeqNr uint64) {
	if _, ok := c.seenMessages[sourceChainSelector]; !ok {
		return
	}

	for i := minSeqNr; i <= maxSeqNr; i++ {
		c.seenMessages[sourceChainSelector][i] = true
	}
}

func (c *CommitReportTracker) allCommited(sourceChainSelector uint64) bool {
	for _, v := range c.seenMessages[sourceChainSelector] {
		if !v {
			return false
		}
	}
	return true
}

var (
	// ErrTimeout is returned when event subscription times out
	ErrTimeout = errors.New("timed out waiting for events")
)

// TON blockchain polling configuration
const (
	clientRetries       = 3                      // Number of retries for TON client operations
	queryInterval       = 500 * time.Millisecond // How often to query logpoller for new events
	progressLogInterval = 5 * time.Second        // How often to log "still waiting" progress updates
)

// setupLogPoller creates and starts a logpoller service with in-memory stores for the given contract and event.
func setupLogPoller(
	ctx context.Context,
	lggr logger.Logger,
	tonChain cldf_ton.Chain,
	contract *address.Address,
	eventName string,
) (tonlogpoller.Service, error) {
	chainID := strconv.FormatUint(tonChain.Selector, 10)
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return tonChain.Client.WithRetry(clientRetries), nil
	}

	// Create logpoller with in-memory stores for testing
	service, err := tonlogpoller.NewServiceWith(ctx, lggr, chainID, clientProvider,
		&tonlogpoller.ServiceOptions{
			Config:      tonlogpoller.DefaultConfigSet,
			FilterStore: tonlpstore.NewFilterStore(chainID, lggr),
			TxLoader:    tonlploader.New(lggr, clientProvider),
			LogStore:    tonlpstore.NewLogStore(chainID, lggr),
		},
		[]tonlptypes.Filter{{
			Name:     fmt.Sprintf("%s-%s", contract.String(), eventName),
			Address:  contract,
			EventSig: hash.CRC32(eventName),
			MsgType:  tlb.MsgTypeExternalOut,
		}},
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create logpoller service: %w", err)
	}
	if err := service.Start(ctx); err != nil {
		return nil, fmt.Errorf("failed to start logpoller service: %w", err)
	}

	return service, nil
}

// waitForTONEvent sets up a logpoller and waits for events matching the given criteria.
// Handles service lifecycle and common error patterns.
func waitForTONEvent[T any](
	tonChain cldf_ton.Chain,
	offRamp *address.Address,
	eventName string,
	loggerName string,
	timeout time.Duration,
	processEvent func(event tonlptypes.TypedLog[T]) (done bool, err error),
) error {
	ctx := context.Background()
	lggr, err := logger.New()
	if err != nil {
		return fmt.Errorf("failed to create logger: %w", err)
	}

	service, err := setupLogPoller(ctx, lggr, tonChain, offRamp, eventName)
	if err != nil {
		return err
	}
	defer service.Close()

	eventSig := hash.CRC32(eventName)
	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(queryInterval)
	defer ticker.Stop()

	progressTicker := time.NewTicker(progressLogInterval)
	defer progressTicker.Stop()

	startTime := time.Now()
	seenEvents := make(map[string]bool)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		case <-progressTicker.C:
			fmt.Printf("Still waiting for event %s, elapsed time: %s\n",
				eventName,
				time.Since(startTime).Round(time.Second).String())

		case <-ticker.C:
			if time.Now().After(deadline) {
				return ErrTimeout
			}

			logs, _, _, err := service.NewQuery().
				WithSource(offRamp).
				WithEventSig(eventSig).
				Execute(ctx)
			if err != nil {
				fmt.Printf("Failed to query logs, %v\n", err)
				continue
			}

			events, err := tonlpquery.DecodedLogs[T](logs)
			if err != nil {
				fmt.Printf("Failed to decode logs, %v\n", err)
				continue
			}

			for _, event := range events {
				eventKey := fmt.Sprintf("%d-%d", event.TxLT, event.MsgIndex)
				if seenEvents[eventKey] {
					continue
				}
				seenEvents[eventKey] = true

				done, err := processEvent(event)
				if err != nil {
					return err
				}
				if done {
					return nil
				}
			}
		}
	}
}

// WaitOneSentEventBySeqNo wait and fetch strictly one CCIPMessageSent event by selector and sequence number and selector.
func (m *CCIP16TON) WaitOneSentEventBySeqNo(ctx context.Context, from, to, seq uint64, timeout time.Duration) (any, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Waiting for one sent event for a sequence number")
	a := &tonseqs.TonAdapter{}
	tonChain := m.e.BlockChains.TonChains()[to]
	seqRange := ccipocr3common.SeqNumRange{ccipocr3common.SeqNum(seq), ccipocr3common.SeqNum(seq)}
	tracker := NewCommitReportTracker(from, seqRange)
	reportsProcessed := 0

	offRampAddr, err := a.GetOffRampAddress(m.e.DataStore, to)
	if err != nil {
		return false, fmt.Errorf("failed to get offramp address: %w", err)
	}
	addrCodec := codec.NewAddressCodec()
	rawOffRamp, err := addrCodec.AddressBytesToString(offRampAddr)
	if err != nil {
		return false, fmt.Errorf("failed to convert TON address to bytes: %w", err)
	}
	offRamp, err := address.ParseAddr(rawOffRamp)
	if err != nil {
		return false, fmt.Errorf("failed to parse offramp address: %w", err)
	}

	err = waitForTONEvent(tonChain, offRamp, consts.EventNameCommitReportAccepted, "TON_EVENT_ASSERTION:COMMIT", timeout,
		func(event tonlptypes.TypedLog[offramp.CommitReportAccepted]) (bool, error) {
			mr := event.TypedData.MerkleRoot
			if mr == nil {
				return false, nil // Skip price-only updates
			}

			reportsProcessed++
			if from != mr.SourceChainSelector {
				fmt.Printf("Skipping commit report from source chain %d, waiting for %d\n", mr.SourceChainSelector, from)
				return false, nil // Not the source chain we're waiting for
			}
			fmt.Printf("Received commit, seqNums [%d, %d]\n", mr.MinSeqNr, mr.MaxSeqNr)

			tracker.visitCommitReport(from, mr.MinSeqNr, mr.MaxSeqNr)

			// Check if all messages committed (single or multiple reports)
			if (uint64(seqRange.Start()) >= mr.MinSeqNr && uint64(seqRange.End()) <= mr.MaxSeqNr) ||
				tracker.allCommited(from) {
				fmt.Printf("All sequence numbers committed [%d, %d]\n", seqRange.Start(), seqRange.End())
				return true, nil
			}

			return false, nil
		})

	if errors.Is(err, ErrTimeout) {
		return false, fmt.Errorf("timed out waiting for commit on chain %d from source %d, seq nums %s (%d reports processed): %w",
			tonChain.Selector, from, seqRange.String(), reportsProcessed, err)
	}
	return nil, err
}

// WaitOneExecEventBySeqNo wait and fetch strictly one ExecutionStateChanged event by sequence number and selector.
func (m *CCIP16TON) WaitOneExecEventBySeqNo(ctx context.Context, from, to, seq uint64, timeout time.Duration) (any, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Waiting for one exec event for a sequence number")
	a := &tonseqs.TonAdapter{}
	tonChain := m.e.BlockChains.TonChains()[to]
	eventsProcessed := 0

	offRampAddr, err := a.GetOffRampAddress(m.e.DataStore, to)
	if err != nil {
		return false, fmt.Errorf("failed to get offramp address: %w", err)
	}
	addrCodec := codec.NewAddressCodec()
	rawOffRamp, err := addrCodec.AddressBytesToString(offRampAddr)
	if err != nil {
		return false, fmt.Errorf("failed to convert TON address to bytes: %w", err)
	}
	offRamp, err := address.ParseAddr(rawOffRamp)
	if err != nil {
		return false, fmt.Errorf("failed to parse offramp address: %w", err)
	}

	err = waitForTONEvent(tonChain, offRamp, consts.EventNameExecutionStateChanged, "TON_EVENT_ASSERTION:EXEC", timeout,
		func(event tonlptypes.TypedLog[offramp.ExecutionStateChanged]) (bool, error) {
			exec := event.TypedData

			if exec.SourceChainSelector != from || exec.SequenceNumber != seq {
				return false, nil
			}

			eventsProcessed++

			switch exec.State {
			case utils.EXECUTION_STATE_INPROGRESS:
				return false, nil

			case utils.EXECUTION_STATE_FAILURE:
				fmt.Printf("Execution failed for sequence number %d, message ID: %x\n", exec.SequenceNumber, exec.MessageID)
				return false, fmt.Errorf("execution failed for seq %d on chain %d, message ID: %x",
					exec.SequenceNumber, exec.SourceChainSelector, exec.MessageID)

			case utils.EXECUTION_STATE_SUCCESS:
				fmt.Printf("Execution successful for sequence number %d, message ID: %x\n", exec.SequenceNumber, exec.MessageID)
				return true, nil

			default:
				fmt.Printf("Unknown execution state %d for sequence number %d\n", exec.State, exec.SequenceNumber)
			}

			return false, nil
		})

	if errors.Is(err, ErrTimeout) {
		return nil, fmt.Errorf("timed out waiting for execution on chain %d from source %d: %w",
			tonChain.Selector, from, err)
	}
	return nil, err
}

func (m *CCIP16TON) GetEOAReceiverAddress(ctx context.Context, chainSelector uint64) ([]byte, error) {
	return nil, errors.New("GetEOAReceiverAddress not implemented for TON")
}

func (m *CCIP16TON) GetTokenBalance(ctx context.Context, chainSelector uint64, address, tokenAddress []byte) (*big.Int, error) {
	return nil, errors.New("GetTokenBalance not implemented for TON")
}
