package ops

import (
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"testing"
	"time"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"

	chainsel "github.com/smartcontractkit/chain-selectors"
	mcmstypes "github.com/smartcontractkit/mcms/types"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/fee_quoter"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/client"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/common/proposalutils"
	"github.com/smartcontractkit/chainlink/v2/core/capabilities/ccip/ccipevm"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
)

const ChainSelEVMTest90000001 = 909606746561742123

// TODO: use address.NewNoneAddress() instead?
var TonTokenAddr = address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001")

// DefaultFeeQuoterDestChainConfig returns a default fee quoter config for TON CCIP testing
func DefaultFeeQuoterDestChainConfig(configEnabled bool, destChainSelector ...uint64) feequoter.DestChainConfig {
	familySelector, _ := hex.DecodeString(v1_6.TVMFamilySelector)
	if len(destChainSelector) > 0 {
		destFamily, _ := chainsel.GetSelectorFamily(destChainSelector[0])
		switch destFamily {
		case chainsel.FamilyEVM:
			familySelector, _ = hex.DecodeString(v1_6.EVMFamilySelector)
		case chainsel.FamilySolana:
			familySelector, _ = hex.DecodeString(v1_6.SVMFamilySelector)
		case chainsel.FamilyAptos:
			familySelector, _ = hex.DecodeString(v1_6.AptosFamilySelector)
		}
	}
	return feequoter.DestChainConfig{
		IsEnabled:                       configEnabled,
		MaxNumberOfTokensPerMsg:         0,
		MaxDataBytes:                    100,
		MaxPerMsgGasLimit:               100,
		DestGasOverhead:                 0,
		DestGasPerPayloadByteBase:       0,
		DestGasPerPayloadByteHigh:       0,
		DestGasPerPayloadByteThreshold:  0,
		DestDataAvailabilityOverheadGas: 0,
		DestGasPerDataAvailabilityByte:  0,
		ChainFamilySelector:             binary.BigEndian.Uint32(familySelector),
		EnforceOutOfOrder:               false,
		DefaultTokenFeeUsdCents:         0,
		DefaultTokenDestGasOverhead:     0,
		DefaultTxGasLimit:               1,
		GasMultiplierWeiPerEth:          0,
		GasPriceStalenessThreshold:      0,
		NetworkFeeUsdCents:              0,
	}
}

func DeployChainContractsToTonCS(t *testing.T, env cldf.Environment, chainSelector uint64) commonchangeset.ConfiguredChangeSet {
	tonChain := env.BlockChains.TonChains()[chainSelector]
	deployer := tonChain.Wallet

	return commonchangeset.Configure(DeployCCIPContracts{}, DeployCCIPContractsCfg{
		TonChainSelector: chainSelector,
		Params: config.ChainContractParams{
			FeeQuoterParams: config.FeeQuoterParams{
				MaxFeeJuelsPerMsg:            big.NewInt(1),
				TokenPriceStalenessThreshold: 0,
				FeeTokens: map[shared.TokenSymbol]config.FeeToken{
					"TON": {
						Address:                    TonTokenAddr,
						PremiumMultiplierWeiPerEth: 1,
					},
				},
			},
			OffRampParams: config.OffRampParams{
				// ...
			},
			OnRampParams: config.OnRampParams{
				ChainSelector: ChainSelEVMTest90000001,
				// TODO:
				// AllowlistAdmin: &address.Address{},
				FeeAggregator: deployer.WalletAddress(),
			},
		},
		ContractsVersion: sequence.ContractsLocalVersion,
	})
}

// TODO add TON token price into func parameters
func AddLaneTONChangesets(env *cldf.Environment, from, to uint64, fromFamily, toFamily string, gasPrices map[uint64]*big.Int) commonchangeset.ConfiguredChangeSet {
	if fromFamily != chainsel.FamilyTon && toFamily != chainsel.FamilyTon {
		env.Logger.Fatalf("AddLaneTONChangesets: expected at least one chain to be TON, got fromFamily=%s, toFamily=%s", fromFamily, toFamily)
	}

	var src, dest config.ChainDefinition
	// TODO: LINK placeholder address

	switch fromFamily {
	case chainsel.FamilyEVM:
		src = config.EVMChainDefinition{
			ChainDefinition: v1_6.ChainDefinition{
				ConnectionConfig: v1_6.ConnectionConfig{
					RMNVerificationDisabled: true,
				},
				Selector: from,
				GasPrice: gasPrices[from],
			},
		}
	case chainsel.FamilyTon:
		src = config.TonChainDefinition{
			ConnectionConfig: v1_6.ConnectionConfig{
				RMNVerificationDisabled: true,
				AllowListEnabled:        false,
			},
			Selector: from,
			GasPrice: gasPrices[from],
			TokenPrices: map[*address.Address]*big.Int{
				TonTokenAddr: big.NewInt(99),
			},
			FeeQuoterDestChainConfig: DefaultFeeQuoterDestChainConfig(true, to),
			TokenTransferFeeConfigs:  map[uint64]feequoter.UpdateTokenTransferFeeConfig{
				// TODO:
			},
		}
	default:
		env.Logger.Fatalf("Unsupported source chain family: %v", fromFamily)
	}

	switch toFamily {
	case chainsel.FamilyEVM:
		dest = config.EVMChainDefinition{
			ChainDefinition: v1_6.ChainDefinition{
				ConnectionConfig: v1_6.ConnectionConfig{
					AllowListEnabled: false,
				},
				Selector: to,
				GasPrice: gasPrices[to],
				FeeQuoterDestChainConfig: fee_quoter.FeeQuoterDestChainConfig{
					IsEnabled:                         true,
					MaxNumberOfTokensPerMsg:           10,
					MaxDataBytes:                      30_000,
					MaxPerMsgGasLimit:                 3_000_000,
					DestGasOverhead:                   ccipevm.DestGasOverhead,
					DestGasPerPayloadByteBase:         ccipevm.CalldataGasPerByteBase,
					DestGasPerPayloadByteHigh:         ccipevm.CalldataGasPerByteHigh,
					DestGasPerPayloadByteThreshold:    ccipevm.CalldataGasPerByteThreshold,
					DestDataAvailabilityOverheadGas:   100,
					DestGasPerDataAvailabilityByte:    16,
					DestDataAvailabilityMultiplierBps: 1,
					ChainFamilySelector:               [4]byte{0x28, 0x12, 0xd5, 0x2c},
					EnforceOutOfOrder:                 false,
					DefaultTokenFeeUSDCents:           25,
					DefaultTokenDestGasOverhead:       90_000,
					DefaultTxGasLimit:                 200_000,
					GasMultiplierWeiPerEth:            11e8, // TODO what's the scale here ?
					GasPriceStalenessThreshold:        0,
					NetworkFeeUSDCents:                10,
				},
			},
			OnRampVersion: []byte{1, 6, 1},
		}
	case chainsel.FamilyTon:
		dest = config.TonChainDefinition{
			ConnectionConfig: v1_6.ConnectionConfig{
				RMNVerificationDisabled: true,
				AllowListEnabled:        false,
			},
			Selector: to,
			GasPrice: big.NewInt(1e17),
			TokenPrices: map[*address.Address]*big.Int{
				TonTokenAddr: big.NewInt(99),
			},
			FeeQuoterDestChainConfig: DefaultFeeQuoterDestChainConfig(true, to),
			TokenTransferFeeConfigs:  map[uint64]feequoter.UpdateTokenTransferFeeConfig{
				// TODO:
			},
		}

	default:
		env.Logger.Fatalf("Unsupported dstination chain family: %v", toFamily)
	}

	laneConfig := config.UpdateTonLanesConfig{
		EVMMCMSConfig: &proposalutils.TimelockConfig{},
		TonMCMSConfig: &proposalutils.TimelockConfig{
			MinDelay:     time.Second,
			MCMSAction:   mcmstypes.TimelockActionSchedule,
			OverrideRoot: false,
		},
		Lanes: []config.LaneConfig{
			{
				Source:     src,
				Dest:       dest,
				IsDisabled: false,
			},
		},
		TestRouter: false,
	}
	return commonchangeset.Configure(AddTonLanes{}, laneConfig)
}

// TODO Consider move chainlink core AnyMsgSentEvent and CCIPSendReqConfig to CLDF?

type TonSendRequest struct {
	QueryID   uint64
	Receiver  []byte
	Data      []byte
	ExtraArgs *cell.Cell
	FeeToken  *address.Address
	// TokenAmounts  common.SnakeRef[ocr.Any2TVMTokenTransfer]
}

// SendTonRequest sends a CCIP request from a TON chain.
func SendTonRequest(
	e cldf.Environment,
	state stateview.CCIPOnChainState,
	cfg *client.CCIPSendReqConfig) (*client.AnyMsgSentEvent, error) {
	senderWallet := e.BlockChains.TonChains()[cfg.SourceChain].Wallet
	senderAddr := e.BlockChains.TonChains()[cfg.SourceChain].WalletAddress
	clientConn := e.BlockChains.TonChains()[cfg.SourceChain].Client

	e.Logger.Infof("(Ton) Sending CCIP request from chain selector %d to chain selector %d using sender %s",
		cfg.SourceChain, cfg.DestChain, senderAddr.String())

	msg := cfg.Message.(TonSendRequest)
	routerAddr := state.TonChains[cfg.SourceChain].Router

	ccipSend := router.CCIPSend{
		QueryID:           msg.QueryID,
		DestChainSelector: cfg.DestChain,
		Receiver:          msg.Receiver,
		Data:              msg.Data,
		FeeToken:          msg.FeeToken,
		TokenAmounts:      nil, // TODO: add token amounts when token transfer enabled
		ExtraArgs:         msg.ExtraArgs,
	}

	ccipSendCell, err := tlb.ToCell(ccipSend)
	if err != nil {
		return nil, fmt.Errorf("failed to convert to cell: %w", err)
	}

	walletMsg := &wallet.Message{
		Mode: wallet.PayGasSeparately, // TODO: wallet.IgnoreErrors ?
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      false,
			DstAddr:     &routerAddr,
			Amount:      tlb.MustFromTON("1.0"), // TODO:
			Body:        ccipSendCell,
		},
	}

	ttConn := tracetracking.NewSignedAPIClient(clientConn, *senderWallet)
	receivedMsg, blockID, err := ttConn.SendWaitTransaction(e.GetContext(), routerAddr, walletMsg)
	if err != nil {
		return nil, fmt.Errorf("failed to send transaction: %w", err)
	}

	if receivedMsg.ExitCode != 0 {
		return nil, fmt.Errorf("transaction failed: with exitcode %d: %s", receivedMsg.ExitCode, receivedMsg.ExitCode.Describe())
	}

	e.Logger.Infow("transaction sent", "blockID", blockID, "receivedMsg", receivedMsg)
	err = receivedMsg.WaitForTrace(clientConn)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for trace: %w", err)
	}

	seqNum, err := waitForReceivedMsgFlatten(e, clientConn, receivedMsg)
	if err != nil {
		return nil, fmt.Errorf("failed to get seqNum from flattening received messages: %w", err)
	}

	return &client.AnyMsgSentEvent{
		SequenceNumber: seqNum,
	}, nil
}

func waitForReceivedMsgFlatten(e cldf.Environment, clientConn *ton.APIClient, msg *tracetracking.ReceivedMessage) (uint64, error) {
	if msg == nil {
		return 0, errors.New("received message is nil")
	}

	// Collect all messages to process in a queue
	var messagesToProcess []*tracetracking.ReceivedMessage
	messagesToProcess = append(messagesToProcess, msg)

	var lastMsg *tracetracking.ReceivedMessage

	// Process messages iteratively
	for len(messagesToProcess) > 0 {
		// Get the first message from the queue
		currentMsg := messagesToProcess[0]
		messagesToProcess = messagesToProcess[1:]

		if len(currentMsg.OutgoingInternalReceivedMessages) == 0 {
			continue
		}

		e.Logger.Infof("Flattening %d outgoing internal messages", len(currentMsg.OutgoingInternalReceivedMessages))

		for i, outMsg := range currentMsg.OutgoingInternalReceivedMessages {
			e.Logger.Infof("Outgoing message %d: exit code %v, success: %v, bounced: %v, status: %v",
				i, outMsg.ExitCode, outMsg.Success, outMsg.EmittedBouncedMessage, outMsg.Status())

			if outMsg.ExitCode != 0 {
				e.Logger.Errorf("Outgoing message %d failed with exit code %v", i, outMsg.ExitCode)
			}
			if !outMsg.Success {
				e.Logger.Errorf("Outgoing message %d was not successful", i)
			}
			if outMsg.EmittedBouncedMessage {
				e.Logger.Errorf("Outgoing message %d was bounced", i)
			}

			err := outMsg.WaitForTrace(clientConn)
			if err != nil {
				e.Logger.Errorf("failed to wait for trace: %v", err)
				continue
			}

			// Add this message to the queue for further processing
			messagesToProcess = append(messagesToProcess, outMsg)
			lastMsg = outMsg
		}
	}

	if lastMsg == nil || len(lastMsg.OutgoingExternalMessages) == 0 {
		return 0, errors.New("no received messages were processed")
	}

	var ccipResp onramp.CCIPMessageSent
	err := tlb.LoadFromCell(&ccipResp, lastMsg.OutgoingExternalMessages[0].Body.BeginParse())
	if err != nil {
		e.Logger.Errorf("failed to parse CCIPMessageSent from cell: %v", err)
		return 0, err
	}

	return ccipResp.Message.Header.SequenceNumber, nil
}
