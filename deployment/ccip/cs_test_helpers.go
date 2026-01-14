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

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug"
	sequenceDiagram "github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/visualizations/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"
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
	chain := env.BlockChains.TonChains()[chainSelector]
	deployer := chain.Wallet

	// if contractVersion is not set, use local version
	if contractVersion == "" {
		contractVersion = sequence.ContractsLocalVersion
	}

	ccipContractSemver := semver.MustParse("1.6.0")
	return DeployCCIPContractsCfg{
		TonChainSelector: chainSelector,
		Params: config.ChainContractParams{
			RouterParams: config.RouterParams{
				ID:              idForContracts,
				Coin:            "0.05",
				ContractsSemver: ccipContractSemver,
			},
			FeeQuoterParams: config.FeeQuoterParams{
				ID:                           idForContracts,
				Coin:                         "0.05",
				ContractsSemver:              ccipContractSemver,
				MaxFeeJuelsPerMsg:            big.NewInt(0).Mul(big.NewInt(2e2), big.NewInt(1e18)),
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
				Coin:                             "0.05",
				ContractsSemver:                  ccipContractSemver,
				ChainSelector:                    chain.Selector,
				PermissionlessExecutionThreshold: 0,
			},
			OnRampParams: config.OnRampParams{
				ID:              idForContracts,
				Coin:            "0.05",
				ContractsSemver: ccipContractSemver,
				ChainSelector:   ChainSelEVMTest90000001,
				// TODO:
				// AllowlistAdmin: &address.Address{},
				FeeAggregator: deployer.WalletAddress(),
				Reserve:       "0.5",
			},
			ReceiverParams: config.ReceiverParams{
				ID:              idForContracts,
				Coin:            "0.05",
				ContractsSemver: ccipContractSemver,
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

	tonTokenPrice, err := config.CCIPTokenPrice("2", 9) // Example value
	if err != nil {
		env.Logger.Fatalf("AddLaneTONChangesets: failed to get TON token price: %v", err)
	}
	linkTokenPrice, err := config.CCIPTokenPrice("10", 18) // Example value
	if err != nil {
		env.Logger.Fatalf("AddLaneTONChangesets: failed to get Link token price: %v", err)
	}
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
				tvm.TonTokenAddr.String():  tonTokenPrice,
				tvm.LinkTokenAddr.String(): linkTokenPrice,
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
// SendCCIPMessage sends a CCIP request from a TON chain using the standard router.CCIPSend message.
// TODO: add TokenAmounts support for TON token transfers
func SendCCIPMessage(
	e cldf.Environment,
	state state.CCIPChainState,
	sourceChain uint64,
	msg router.CCIPSend) (uint64, any, error) {
	chain := e.BlockChains.TonChains()[sourceChain]
	senderWallet := chain.Wallet
	senderAddr := chain.WalletAddress
	clientConn := chain.Client

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
