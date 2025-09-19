package ops

import (
	"errors"
	"fmt"
	"math/big"
	"testing"

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
)

func DeployChainContractsConfig(t *testing.T, env cldf.Environment, chainSelector uint64, contractVersion string) DeployCCIPContractsCfg {
	tonChain := env.BlockChains.TonChains()[chainSelector]
	deployer := tonChain.Wallet

	// if contractVersion is not set, use local version
	if contractVersion == "" {
		contractVersion = sequence.ContractsLocalVersion
	}

	return DeployCCIPContractsCfg{
		TonChainSelector: chainSelector,
		Params: config.ChainContractParams{
			FeeQuoterParams: config.FeeQuoterParams{
				MaxFeeJuelsPerMsg:            big.NewInt(1),
				TokenPriceStalenessThreshold: 0,
				FeeTokens: map[config.TokenSymbol]config.FeeToken{
					"TON": {
						Address:                    TonTokenAddr,
						PremiumMultiplierWeiPerEth: 1,
					},
				},
			},
			OffRampParams: config.OffRampParams{
				ChainSelector:                    tonChain.Selector,
				PermissionlessExecutionThreshold: 0,
			},
			OnRampParams: config.OnRampParams{
				ChainSelector: ChainSelEVMTest90000001,
				// TODO:
				// AllowlistAdmin: &address.Address{},
				FeeAggregator: deployer.WalletAddress(),
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

	const TONtoUSD = 3.15              // As of September 2025
	const TONtoNanoTON = 1e9           // Smallest denomination
	const TokenPriceBaseAmount = 1e18  // Defined for `TokenPrices`
	var USDDecimals = big.NewInt(1e18) // Defined for `TokenPrices`
	var TONBaseAmountTokenPrice = big.NewInt(int64(TONtoUSD * (TokenPriceBaseAmount / TONtoNanoTON)))
	TON_TOKEN_PRICE := big.NewInt(0).Mul(TONBaseAmountTokenPrice, USDDecimals)
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
				TonTokenAddr.String(): TON_TOKEN_PRICE,
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
			GasPrice: big.NewInt(1e17),
			TokenPrices: map[string]*big.Int{
				TonTokenAddr.String(): TON_TOKEN_PRICE,
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
	state state.CCIPChainState,
	sourceChain, destChain uint64,
	msg TonSendRequest) (uint64, any, error) {
	tonChain := e.BlockChains.TonChains()[sourceChain]
	senderWallet := tonChain.Wallet
	senderAddr := tonChain.WalletAddress
	clientConn := tonChain.Client

	e.Logger.Infof("(Ton) Sending CCIP request from chain selector %d to chain selector %d using sender %s",
		sourceChain, destChain, senderAddr.String())

	routerAddr := state.Router

	ccipSend := router.CCIPSend{
		QueryID:           msg.QueryID,
		DestChainSelector: destChain,
		Receiver:          msg.Receiver,
		Data:              msg.Data,
		FeeToken:          msg.FeeToken,
		TokenAmounts:      nil, // TODO: add token amounts when token transfer enabled
		ExtraArgs:         msg.ExtraArgs,
	}

	ccipSendCell, err := tlb.ToCell(ccipSend)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to convert to cell: %w", err)
	}

	walletMsg := &wallet.Message{
		Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
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
		return 0, nil, fmt.Errorf("failed to send transaction: %w", err)
	}

	if receivedMsg.ExitCode != 0 {
		return 0, nil, fmt.Errorf("transaction failed: with exitcode %d: %s", receivedMsg.ExitCode, receivedMsg.ExitCode.Describe())
	}

	e.Logger.Infow("transaction sent", "blockID", blockID, "receivedMsg", receivedMsg)
	err = receivedMsg.WaitForTrace(clientConn)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to wait for trace: %w", err)
	}

	event, err := waitForReceivedMsgFlatten(e, clientConn, receivedMsg)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to get CCIPMessageSent from flattening received messages: %w", err)
	}
	return event.Message.Header.SequenceNumber, event, nil
}

func waitForReceivedMsgFlatten(e cldf.Environment, clientConn *ton.APIClient, msg *tracetracking.ReceivedMessage) (onramp.CCIPMessageSent, error) {
	if msg == nil {
		return onramp.CCIPMessageSent{}, errors.New("received message is nil")
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
		return onramp.CCIPMessageSent{}, errors.New("no received messages were processed")
	}

	var event onramp.CCIPMessageSent
	err := tlb.LoadFromCell(&event, lastMsg.OutgoingExternalMessages[0].Body.BeginParse())
	if err != nil {
		e.Logger.Errorf("failed to parse CCIPMessageSent from cell: %v", err)
		return onramp.CCIPMessageSent{}, err
	}

	return event, nil
}
