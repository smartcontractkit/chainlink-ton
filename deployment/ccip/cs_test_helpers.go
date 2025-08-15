package ops

import (
	"fmt"
	"math/big"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/fee_quoter"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/client"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/common/proposalutils"
	"github.com/smartcontractkit/chainlink/v2/core/capabilities/ccip/ccipevm"
	mcmstypes "github.com/smartcontractkit/mcms/types"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
)

const ChainSelEVMTest90000001 = 909606746561742123

func DeployChainContractsToTonCS(t *testing.T, env cldf.Environment, chainSelector uint64) commonchangeset.ConfiguredChangeSet {
	tonChain := env.BlockChains.TonChains()[chainSelector]
	deployer := tonChain.Wallet

	return commonchangeset.Configure(DeployCCIPContracts{}, DeployCCIPContractsCfg{
		TonChainSelector: chainSelector,
		Params: config.ChainContractParams{
			FeeQuoterParams: config.FeeQuoterParams{
				MaxFeeJuelsPerMsg:                    big.NewInt(1),
				TokenPriceStalenessThreshold:         0,
				FeeTokens:                            []*address.Address{},
				PremiumMultiplierWeiPerEthByFeeToken: map[shared.TokenSymbol]uint64{},
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
	})
}

// TODO add TON token price into func parameters
func AddLaneTONChangesets(env *cldf.Environment, from, to uint64, fromFamily, toFamily string, gasPrices map[uint64]*big.Int) commonchangeset.ConfiguredChangeSet {
	if fromFamily != chainsel.FamilyTon && toFamily != chainsel.FamilyTon {
		env.Logger.Fatalf("AddLaneTONChangesets: expected at least one chain to be TON, got fromFamily=%s, toFamily=%s", fromFamily, toFamily)
	}

	var src, dest config.ChainDefinition
	// TODO: LINK placeholder address
	tonTokenAddr, err := address.ParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000000")
	if err != nil {
		env.Logger.Fatalf("Failed to parse TON token address: %v", err)
	}

	switch fromFamily {
	case chainsel.FamilyEVM:
		src = config.EVMChainDefinition{
			ChainDefinition: v1_6.ChainDefinition{
				ConnectionConfig: v1_6.ConnectionConfig{
					RMNVerificationDisabled: true,
				},
				Selector: from,
			},
		}
	case chainsel.FamilyTon:
		src = config.TonChainDefinition{
			ConnectionConfig: v1_6.ConnectionConfig{
				RMNVerificationDisabled: true,
				AllowListEnabled:        false,
			},
			Selector: from,
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
			OnRampVersion: []byte{1, 6, 0},
		}
	case chainsel.FamilyTon:
		src = config.TonChainDefinition{
			ConnectionConfig: v1_6.ConnectionConfig{
				RMNVerificationDisabled: true,
				AllowListEnabled:        false,
			},
			Selector: from,
			GasPrice: big.NewInt(1e17),
			TokenPrices: map[*address.Address]*big.Int{
				tonTokenAddr: big.NewInt(99),
			},
			FeeQuoterDestChainConfig: feequoter.DestChainConfig{ // minimal valid config
				IsEnabled:                         true,
				MaxNumberOfTokensPerMsg:           0,
				MaxDataBytes:                      100,
				MaxPerMsgGasLimit:                 100,
				DestGasOverhead:                   0,
				DestGasPerPayloadByteBase:         0,
				DestGasPerPayloadByteHigh:         0,
				DestGasPerPayloadByteThreshold:    0,
				DestDataAvailabilityOverheadGas:   0,
				DestGasPerDataAvailabilityByte:    0,
				DestDataAvailabilityMultiplierBps: 0,
				ChainFamilySelector:               0,
				EnforceOutOfOrder:                 false,
				DefaultTokenFeeUsdCents:           0,
				DefaultTokenDestGasOverhead:       0,
				DefaultTxGasLimit:                 1,
				GasMultiplierWeiPerEth:            0,
				GasPriceStalenessThreshold:        0,
				NetworkFeeUsdCents:                0,
			},
			TokenTransferFeeConfigs: map[uint64]feequoter.UpdateTokenTransferFeeConfig{
				// TODO:
			},
		}

	default:
		env.Logger.Fatalf("Unsupported dstination chain family: %v", toFamily)
	}

	laneConfig := config.UpdateTonLanesConfig{
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

	// TODO Skipping token amounts setup for now, and in the future for supporting token transfers
	ccipSend := router.CCIPSend{
		QueryID:           msg.QueryID,
		DestChainSelector: cfg.DestChain,
		Receiver:          msg.Receiver,
		Data:              msg.Data,
		FeeToken:          msg.FeeToken,
		ExtraArgs:         msg.ExtraArgs,
	}

	ccipSendCell, err := tlb.ToCell(ccipSend)
	if err != nil {
		return nil, fmt.Errorf("failed to convert to cell: %w", err)
	}

	walletMsg := &wallet.Message{
		Mode: wallet.PayGasSeparately, // TODO: wallet.IgnoreErrors ?
		InternalMessage: &tlb.InternalMessage{
			Bounce:  true,
			DstAddr: &routerAddr,
			Body:    ccipSendCell,
		},
	}

	ttConn := tracetracking.NewSignedAPIClient(clientConn, *senderWallet)
	receivedMsg, blockID, err := ttConn.SendWaitTransaction(e.GetContext(), routerAddr, walletMsg)
	if err != nil {
		return nil, fmt.Errorf("failed to send transaction: %w", err)
	}

	e.Logger.Infow("transaction sent", "blockID", blockID, "receivedMsg", receivedMsg)
	err = receivedMsg.WaitForTrace(clientConn)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for trace: %w", err)
	}

	// TODO: log poller
	//ca, er := chainaccessor.NewTONAccessor(e.Logger, clientConn, nil)
	//if er != nil {
	//	return nil, fmt.Errorf("failed to create TON accessor: %w", er)
	//}

	//number, err := ca.GetExpectedNextSequenceNumber(e.GetContext(), cciptypes.ChainSelector(cfg.DestChain))
	//if err != nil {
	//	return nil, err
	//}

	return &client.AnyMsgSentEvent{
		//SequenceNumber: uint64(number),
	}, nil
}
