package ops

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"math/big"
	"testing"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug"
	sequenceDiagram "github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/visualizations/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
)

const (
	ChainSelEVMTest90000001     = 909606746561742123
	DestGasOverhead             = 300_000 // Commit and Exec costs
	CalldataGasPerByteBase      = 16
	CalldataGasPerByteHigh      = 40
	CalldataGasPerByteThreshold = 3000
)

var TonTokenAddr = address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001")

var (
	// TODO Remove in favor of the canonical model
	EvmFeeQuoterDestChainConfig = config.FeeQuoterDestChainConfig{
		IsEnabled:                         true,
		MaxNumberOfTokensPerMsg:           10,
		MaxDataBytes:                      30_000,
		MaxPerMsgGasLimit:                 3_000_000,
		DestGasOverhead:                   DestGasOverhead,
		DestGasPerPayloadByteBase:         CalldataGasPerByteBase,
		DestGasPerPayloadByteHigh:         CalldataGasPerByteHigh,
		DestGasPerPayloadByteThreshold:    CalldataGasPerByteThreshold,
		DestDataAvailabilityOverheadGas:   100,
		DestGasPerDataAvailabilityByte:    16,
		DestDataAvailabilityMultiplierBps: 1,
		ChainFamilySelector:               config.EVMFamilySelector,
		EnforceOutOfOrder:                 false,
		DefaultTokenFeeUSDCents:           25,
		DefaultTokenDestGasOverhead:       90_000,
		DefaultTxGasLimit:                 200_000,
		GasMultiplierWeiPerEth:            11e17,
		GasPriceStalenessThreshold:        0,
		NetworkFeeUSDCents:                10,
	}

	EvmFeeQuoterDestChainCanonicalConfig = lanes.FeeQuoterDestChainConfig{
		IsEnabled:                         true,
		MaxNumberOfTokensPerMsg:           10,
		MaxDataBytes:                      30_000,
		MaxPerMsgGasLimit:                 3_000_000,
		DestGasOverhead:                   DestGasOverhead,
		DestGasPerPayloadByteBase:         CalldataGasPerByteBase,
		DestGasPerPayloadByteHigh:         CalldataGasPerByteHigh,
		DestGasPerPayloadByteThreshold:    CalldataGasPerByteThreshold,
		DestDataAvailabilityOverheadGas:   100,
		DestGasPerDataAvailabilityByte:    16,
		DestDataAvailabilityMultiplierBps: 1,
		ChainFamilySelector:               config.EVMFamilySelector,
		EnforceOutOfOrder:                 false,
		DefaultTokenFeeUSDCents:           25,
		DefaultTokenDestGasOverhead:       90_000,
		DefaultTxGasLimit:                 200_000,
		GasMultiplierWeiPerEth:            11e17,
		GasPriceStalenessThreshold:        0,
		NetworkFeeUSDCents:                10,
	}

	// TODO Remove in favor of the canonical model
	// Default fee quoter config for TON CCIP testing
	TonFeeQuoterDestChainConfig = config.FeeQuoterDestChainConfig{
		IsEnabled:                       true,
		MaxNumberOfTokensPerMsg:         0,
		MaxDataBytes:                    100,
		MaxPerMsgGasLimit:               100,
		DestGasOverhead:                 0,
		DestGasPerPayloadByteBase:       0,
		DestGasPerPayloadByteHigh:       0,
		DestGasPerPayloadByteThreshold:  0,
		DestDataAvailabilityOverheadGas: 0,
		DestGasPerDataAvailabilityByte:  0,
		ChainFamilySelector:             config.TVMFamilySelector,
		EnforceOutOfOrder:               false,
		DefaultTokenFeeUSDCents:         0,
		DefaultTokenDestGasOverhead:     0,
		DefaultTxGasLimit:               1,
		GasMultiplierWeiPerEth:          0,
		GasPriceStalenessThreshold:      0,
		NetworkFeeUSDCents:              0,
	}

	// Default fee quoter config for TON CCIP testing
	TonFeeQuoterDestChainCanonicalConfig = lanes.FeeQuoterDestChainConfig{
		IsEnabled:                       true,
		MaxNumberOfTokensPerMsg:         0,
		MaxDataBytes:                    100,
		MaxPerMsgGasLimit:               100,
		DestGasOverhead:                 0,
		DestGasPerPayloadByteBase:       0,
		DestGasPerPayloadByteHigh:       0,
		DestGasPerPayloadByteThreshold:  0,
		DestDataAvailabilityOverheadGas: 0,
		DestGasPerDataAvailabilityByte:  0,
		ChainFamilySelector:             config.TVMFamilySelector,
		EnforceOutOfOrder:               false,
		DefaultTokenFeeUSDCents:         0,
		DefaultTokenDestGasOverhead:     0,
		DefaultTxGasLimit:               1,
		GasMultiplierWeiPerEth:          0,
		GasPriceStalenessThreshold:      0,
		NetworkFeeUSDCents:              0,
	}
)

func DeployChainContractsConfig(t *testing.T, env cldf.Environment, chainSelector uint64, contractVersion string, idForContracts uint32) DeployCCIPContractsCfg {
	tonChain := env.BlockChains.TonChains()[chainSelector]
	deployer := tonChain.Wallet

	// if contractVersion is not set, use local version
	if contractVersion == "" {
		contractVersion = sequence.ContractsLocalVersion
	}

	return DeployCCIPContractsCfg{
		TonChainSelector: chainSelector,
		Params: config.ChainContractParams{
			RouterParams: config.RouterParams{
				ID: idForContracts,
			},
			FeeQuoterParams: config.FeeQuoterParams{
				ID:                           idForContracts,
				MaxFeeJuelsPerMsg:            big.NewInt(1),
				TokenPriceStalenessThreshold: 0,
				FeeTokens: map[config.TokenSymbol]config.FeeToken{
					"TON": {
						Address:                    tvm.TonTokenAddr,
						PremiumMultiplierWeiPerEth: 1,
					},
				},
			},
			OffRampParams: config.OffRampParams{
				ID:                               idForContracts,
				ChainSelector:                    tonChain.Selector,
				PermissionlessExecutionThreshold: 0,
			},
			OnRampParams: config.OnRampParams{
				ID:            idForContracts,
				ChainSelector: ChainSelEVMTest90000001,
				// TODO:
				// AllowlistAdmin: &address.Address{},
				FeeAggregator: deployer.WalletAddress(),
			},
			ReceiverParams: config.ReceiverParams{
				ID: idForContracts,
			},
			TimelockParams: config.TimelockParams{
				ID:         idForContracts,
				MinDelay:   0,
				Admin:      deployer.WalletAddress(),
				Proposers:  []*address.Address{deployer.WalletAddress()},
				Executors:  []*address.Address{deployer.WalletAddress()},
				Cancellers: []*address.Address{deployer.WalletAddress()},
				Bypassers:  []*address.Address{deployer.WalletAddress()},
			},
		},
		ContractsVersion: contractVersion,
	}
}

// TODO add TON token price into func parameters
func AddLaneTONConfig(env *cldf.Environment, onRamp []byte, from, to uint64, fromFamily, toFamily string, gasPrices map[uint64]*big.Int) config.LaneConfig {
	if fromFamily != chainsel.FamilyTon && toFamily != chainsel.FamilyTon {
		env.Logger.Fatalf("AddLaneTONChangesets: expected at least one chain to be TON, got fromFamily=%s, toFamily=%s", fromFamily, toFamily)
	}

	var src, dest config.ChainDefinition
	// TODO: LINK placeholder address

	const TONtoUSD = 3.15 // As of September 2025
	// const TONtoNanoTON = 1e9           // Smallest denomination
	const TONtoNanoTON = 1e3           // TODO: This is a temporary overwrite until we figure out why feequoter is returning such a high fee
	const TokenPriceBaseAmount = 1e18  // Defined for `TokenPrices`
	var USDDecimals = big.NewInt(1e18) // Defined for `TokenPrices`
	var TONBaseAmountTokenPrice = big.NewInt(int64(TONtoUSD * (TokenPriceBaseAmount / TONtoNanoTON)))
	tonTokenPrice := big.NewInt(0).Mul(TONBaseAmountTokenPrice, USDDecimals)
	switch fromFamily {
	case chainsel.FamilyEVM:
		src = config.ChainDefinition{
			ConnectionConfig: config.ConnectionConfig{
				RMNVerificationDisabled: true,
			},
			Selector: from,
			GasPrice: gasPrices[from],
		}
	case chainsel.FamilyTon:
		src = config.ChainDefinition{
			ConnectionConfig: config.ConnectionConfig{
				RMNVerificationDisabled: true,
				AllowListEnabled:        false,
			},
			Selector: from,
			GasPrice: gasPrices[from],
			TokenPrices: map[string]*big.Int{
				tvm.TonTokenAddr.String(): tonTokenPrice,
			},
			FeeQuoterDestChainConfig: TonFeeQuoterDestChainConfig,
			// TokenTransferFeeConfigs: , TODO:
		}
	default:
		env.Logger.Fatalf("Unsupported source chain family: %v", fromFamily)
	}

	switch toFamily {
	case chainsel.FamilyEVM:
		dest = config.ChainDefinition{
			ConnectionConfig: config.ConnectionConfig{
				AllowListEnabled: false,
			},
			Selector:                 to,
			GasPrice:                 gasPrices[to],
			FeeQuoterDestChainConfig: EvmFeeQuoterDestChainConfig,
		}
	case chainsel.FamilyTon:
		dest = config.ChainDefinition{
			ConnectionConfig: config.ConnectionConfig{
				RMNVerificationDisabled: true,
				AllowListEnabled:        false,
			},
			Selector: to,
			GasPrice: gasPrices[to],
			TokenPrices: map[string]*big.Int{
				tvm.TonTokenAddr.String(): tonTokenPrice,
			},
			FeeQuoterDestChainConfig: TonFeeQuoterDestChainConfig,
			// TokenTransferFeeConfigs: , TODO:
		}
	default:
		env.Logger.Fatalf("Unsupported destination chain family: %v", toFamily)
	}

	return config.LaneConfig{
		Source:        src,
		Dest:          dest,
		OnRampVersion: []byte{1, 6, 1},
		OnRamp:        onRamp,
		IsDisabled:    false,
	}
}

// TODO Consider move chainlink core AnyMsgSentEvent and CCIPSendReqConfig to CLDF?

// TonSendRequest is a simplified CCIP send request structure.
// Deprecated: Use router.CCIPSend directly with SendCCIPMessage for new code.
type TonSendRequest struct {
	QueryID   uint64
	Receiver  []byte
	Data      []byte
	ExtraArgs *cell.Cell
	FeeToken  *address.Address
	// TokenAmounts  common.SnakeRef[ocr.Any2TVMTokenTransfer]
}

// ToRouterCCIPSend converts TonSendRequest to router.CCIPSend.
func (r TonSendRequest) ToRouterCCIPSend(destChainSelector uint64) router.CCIPSend {
	return router.CCIPSend{
		QueryID:           r.QueryID,
		DestChainSelector: destChainSelector,
		Receiver:          r.Receiver,
		Data:              r.Data,
		TokenAmounts:      nil, // TODO: add token amounts when token transfer enabled
		FeeToken:          r.FeeToken,
		ExtraArgs:         r.ExtraArgs,
	}
}

// SendTonRequest sends a CCIP request from a TON chain.
// Deprecated: Use SendCCIPMessage with router.CCIPSend for new code.
func SendTonRequest(
	e cldf.Environment,
	state state.CCIPChainState,
	sourceChain, destChain uint64,
	msg TonSendRequest) (uint64, any, error) {
	return SendCCIPMessage(e, state, sourceChain, msg.ToRouterCCIPSend(destChain))
}

// SendCCIPMessage sends a CCIP request from a TON chain using the standard router.CCIPSend message.
func SendCCIPMessage(
	e cldf.Environment,
	state state.CCIPChainState,
	sourceChain uint64,
	msg router.CCIPSend) (uint64, any, error) {
	tonChain := e.BlockChains.TonChains()[sourceChain]
	senderWallet := tonChain.Wallet
	senderAddr := tonChain.WalletAddress
	clientConn := tonChain.Client

	routerAddr := state.Router

	ccipSend := msg

	ccipSendCell, err := tlb.ToCell(ccipSend)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to convert to cell: %w", err)
	}

	e.Logger.Infof("Getting Fee to send CCIP request from chain selector %d to chain selector %d",
		sourceChain, msg.DestChainSelector)

	ctx := context.Background()
	block, err := clientConn.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to get current masterchain info: %w", err)
	}
	getResult, err := clientConn.RunGetMethod(ctx, block, &state.FeeQuoter, "validatedFeeCell", ccipSendCell)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to get validatedFee: %w", err)
	}

	fee, err := getResult.Int(0)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to get fee: %w", err)
	}
	e.Logger.Infof("Fee to send CCIP request: %s nano TON", fee.String())

	e.Logger.Infof("(Ton) Sending CCIP request from chain selector %d to chain selector %d using sender %s",
		sourceChain, msg.DestChainSelector, senderAddr.String())

	value := big.NewInt(0).Add(fee, tlb.MustFromTON("0.5").Nano() /* To cover for gas */)

	walletMsg := &wallet.Message{
		Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      false,
			DstAddr:     &routerAddr,
			Amount:      tlb.MustFromNano(value, 9),
			Body:        ccipSendCell,
		},
	}

	ttConn := tracetracking.NewSignedAPIClient(clientConn, *senderWallet)
	receivedMsg, blockID, err := ttConn.SendWaitTransaction(e.GetContext(), routerAddr, walletMsg)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to send transaction: %w", err)
	}

	if receivedMsg.ExitCode != 0 {
		return 0, nil, fmt.Errorf("transaction failed: with exitcode %d: %s", receivedMsg.ExitCode, receivedMsg.ExitCode.Describe())
	}

	e.Logger.Infow("transaction sent", "blockID", blockID, "receivedMsg", receivedMsg)
	err = receivedMsg.WaitForTrace(e.GetContext(), clientConn)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to wait for trace: %w", err)
	}

	// TODO: This is temporary debugging code to be removed later
	zeroVersion := *semver.MustParse("0.0.0")
	knownAddresses := map[string]debug.TypeAndVersion{
		senderAddr.String():             {Type: "SenderWallet", Version: zeroVersion},
		state.LinkTokenAddress.String(): {Type: "LinkTokenAddress", Version: zeroVersion},
		state.OffRamp.String():          {Type: "OffRamp", Version: zeroVersion},
		state.Router.String():           {Type: "Router", Version: zeroVersion},
		state.OnRamp.String():           {Type: "OnRamp", Version: zeroVersion},
		state.FeeQuoter.String():        {Type: "FeeQuoter", Version: zeroVersion},
		state.Timelock.String():         {Type: "Timelock", Version: zeroVersion},
		state.ReceiverAddress.String():  {Type: "ReceiverAddress", Version: zeroVersion},
	}
	e.Logger.Infof("Msg tree trace:\n%s\n", debug.NewDebuggerTreeTrace(knownAddresses).DumpReceived(receivedMsg))
	e.Logger.Infof("Msg sequence diagram:\n%s\n", debug.NewDebuggerSequenceTrace(knownAddresses, sequenceDiagram.OutputFmtURL).DumpReceived(receivedMsg))

	event, err := waitForReceivedMsgFlatten(e, clientConn, receivedMsg)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to get CCIPMessageSent from flattening received messages: %w", err)
	}
	return event.Message.Header.SequenceNumber, event, nil
}

func waitForReceivedMsgFlatten(e cldf.Environment, clientConn ton.APIClientWrapped, msg *tracetracking.ReceivedMessage) (onramp.CCIPMessageSent, error) {
	if msg == nil {
		return onramp.CCIPMessageSent{}, errors.New("received message is nil")
	}

	// Collect all messages to process in a queue
	var messagesToProcess []*tracetracking.ReceivedMessage
	messagesToProcess = append(messagesToProcess, msg)

	var commitMessage *tracetracking.ReceivedMessage

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

			err := outMsg.WaitForTrace(e.GetContext(), clientConn)
			if err != nil {
				e.Logger.Errorf("failed to wait for trace: %v", err)
				continue
			}

			// Add this message to the queue for further processing
			messagesToProcess = append(messagesToProcess, outMsg)
			opcode, err := outMsg.InternalMsg.Body.BeginParse().LoadUInt(32)
			if err == nil && opcode == onramp.OpcodeOnRampExecutorFinishedSuccessfully {
				commitMessage = outMsg
			}
		}
	}

	if commitMessage == nil || len(commitMessage.OutgoingExternalMessages) == 0 {
		return onramp.CCIPMessageSent{}, errors.New("no received messages were processed")
	}

	var event onramp.CCIPMessageSent
	err := tlb.LoadFromCell(&event, commitMessage.OutgoingExternalMessages[0].Body.BeginParse())
	if err != nil {
		e.Logger.Errorf("failed to parse CCIPMessageSent from cell: %v", err)
		return onramp.CCIPMessageSent{}, err
	}

	return event, nil
}

func RandomUint32() (uint32, error) {
	var b [4]byte
	_, err := rand.Read(b[:])
	if err != nil {
		return 0, err
	}
	return binary.LittleEndian.Uint32(b[:]), nil
}
