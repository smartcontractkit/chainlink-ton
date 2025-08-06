package ops

import (
	"fmt"
	"math/big"
	"testing"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared"
	client "github.com/smartcontractkit/chainlink/deployment/ccip/shared/client"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/ops/ccip/config"
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

func AddLaneTONChangesets(env *cldf.Environment, from, to uint64, fromFamily, toFamily string) commonchangeset.ConfiguredChangeSet {
	panic("unimplemented")
	laneConfig := config.UpdateTonLanesConfig{}
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

	ctx := e.GetContext()
	tx, blockID, err := senderWallet.SendWaitTransaction(ctx, walletMsg)
	e.Logger.Infow("transaction sent", "blockID", blockID, "tx", tx)
	if err != nil {
		return nil, fmt.Errorf("failed to send transaction: %w", err)
	}

	// TODO get CCIPSent event from onramp ?
	//ccipMessageSentEvent := onramp.CCIPMessageSent{}

	return &client.AnyMsgSentEvent{
		// TODO add more fields if needed:
		//SequenceNumber: ccipMessageSentEvent.SequenceNumber,
	}, nil
}
