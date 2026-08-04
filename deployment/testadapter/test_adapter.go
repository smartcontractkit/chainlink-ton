package testadapter

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"math/rand/v2"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/Masterminds/semver/v3"
	ag_binary "github.com/gagliardetto/binary"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	chain_selectors "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccip/consts"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-common/pkg/utils/tests"
	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ccip/deployment/common/extraargs"
	"github.com/smartcontractkit/chainlink-ccip/deployment/testadapters"
	tokensapi "github.com/smartcontractkit/chainlink-ccip/deployment/tokens"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/hash"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/minter"
	jettonwallet "github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/receiver"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug"
	sequenceDiagram "github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/visualizations/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	tonlogpoller "github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	tonlploader "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"
	tonlptypes "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	tonlpquery "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
	tonlpstore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
)

func init() {
	testadapters.GetTestAdapterRegistry().RegisterTestAdapter(chain_selectors.FamilyTon, semver.MustParse("1.6.0"), NewTONAdapter)
}

type TONAdapter struct {
	state testadapters.StateProvider
	cldf_ton.Chain
}

func NewTONAdapter(env *deployment.Environment, selector uint64) testadapters.TestAdapter {
	c, ok := env.BlockChains.TonChains()[selector]
	if !ok {
		panic(fmt.Sprintf("chain not found: %d", selector))
	}

	s := &testadapters.DataStoreStateProvider{Selector: selector, DS: env.DataStore}
	return &TONAdapter{
		state: s,
		Chain: c,
	}
}

func (a *TONAdapter) getAddress(ty datastore.ContractType) (address.Address, error) {
	addr, err := a.state.GetAddress(ty)
	if err != nil {
		return address.Address{}, fmt.Errorf("failed to get %v address: %w", ty, err)
	}
	return *address.MustParseAddr(addr), nil
}

func (a *TONAdapter) BuildMessage(components testadapters.MessageComponents) (any, error) {
	var feeToken *address.Address
	// default to native TON token when fee token is empty
	if len(components.FeeToken) == 0 {
		feeToken = tvm.TonTokenAddr
	} else {
		var err error
		feeToken, err = address.ParseAddr(components.FeeToken)
		if err != nil {
			return nil, err
		}
	}

	c, err := cell.FromBOC(components.ExtraArgs)
	if err != nil {
		return nil, err
	}

	tokenAmounts := make(common.SnakedCell[router.TokenAmount], 0, len(components.TokenAmounts))
	for _, ta := range components.TokenAmounts {
		tokenAddr, err := address.ParseAddr(ta.Token)
		if err != nil {
			return nil, fmt.Errorf("failed to parse token address %q: %w", ta.Token, err)
		}
		amount, err := tlb.FromNano(ta.Amount, 9)
		if err != nil {
			return nil, fmt.Errorf("failed to convert token amount %q to coins: %w", ta.Amount, err)
		}
		tokenAmounts = append(tokenAmounts, router.TokenAmount{
			Amount: amount,
			Token:  tokenAddr,
		})
	}

	ccipSend := router.CCIPSend{
		QueryID:           rand.Uint64(),
		DestChainSelector: components.DestChainSelector,
		Data:              components.Data,
		Receiver:          components.Receiver,
		TokenAmounts:      tokenAmounts,
		ExtraArgs:         c, // TODO handle ExtraArgs properly
		FeeToken:          feeToken,
	}
	// If there are no tokenAmounts this is arbitrary messaging, return the CCIPSend message
	if components.TokenAmounts == nil {
		return ccipSend, nil
	}
	if len(components.TokenAmounts) > 1 {
		return nil, errors.New("multiple token transfers are not supported on TON")
	}
	tokenAmount := components.TokenAmounts[0]
	// Right now for messages with token transfers we transfer the tokens to the Router wallet and the CCIPSend message goes in the forward payload.
	tokenAddr, err := address.ParseAddr(tokenAmount.Token)
	if err != nil {
		return nil, errors.New("failed to parse token address")
	}

	routerAddr, err := a.getAddress(state.Router)
	if err != nil {
		return nil, fmt.Errorf("failed to get router address: %w", err)
	}

	// The message is sent to the sender's own jetton wallet, which then forwards the
	// tokens to the Router's jetton wallet (derived on-chain from TransferRecipient).
	ownedWalletAddr, err := tvm.CallGetterLatest(context.Background(), a.Client, tokenAddr, minter.GetWalletAddress, a.WalletAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to derive owned jetton wallet address: %w", err)
	}

	ccipSendCell, err := tlb.ToCell(ccipSend)
	if err != nil {
		return nil, fmt.Errorf("failed to convert CCIPSend message to cell: %w", err)
	}

	return TokenTransferMessage{
		OwnedJettonWallet: ownedWalletAddr,
		Transfer: jettonwallet.AskToTransfer{
			QueryID:           rand.Uint64(),
			JettonAmount:      tokenAmounts[0].Amount,
			TransferRecipient: &routerAddr,
			SendExcessesTo:    a.WalletAddress,
			ForwardTonAmount:  tlb.MustFromTON("5"),
			ForwardPayload:    ccipSendCell,
		},
	}, nil
}

// TokenTransferMessage is the message built by BuildMessage when the CCIP request includes
// token transfers. It must be sent to OwnedJettonWallet (the sender's own jetton wallet, already
// deployed via the pre-mint step in DeployToken), which forwards the tokens to the Router along
// with the CCIPSend message as forward payload.
type TokenTransferMessage struct {
	OwnedJettonWallet *address.Address
	Transfer          jettonwallet.AskToTransfer
}

func (a *TONAdapter) SendMessage(ctx context.Context, destChainSelector uint64, m any) (uint64, string, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Sending CCIP message")

	var seq uint64
	var eAny any
	var err error
	switch msg := m.(type) {
	case router.CCIPSend:
		// Arbitrary messaging (no token transfer): send the CCIPSend message directly to the Router.
		seq, eAny, err = SendCCIPMessage(ctx, a.Chain, a.state, a.Selector, msg)
	case TokenTransferMessage:
		// Token transfer: send the jetton transfer to the sender's own jetton wallet, which
		// forwards the tokens (and the CCIPSend message in the forward payload) to the Router.
		seq, eAny, err = SendTokenTransferMessage(ctx, a.Chain, a.state, a.Selector, msg)
	default:
		return 0, "", fmt.Errorf("unsupported message type %T: expected router.CCIPSend or TokenTransferMessage", m)
	}
	if err != nil {
		return 0, "", err
	}
	event, ok := eAny.(onramp.CCIPMessageSent)
	if !ok {
		return 0, "", errors.New("expected onramp.CCIPMessageSent")
	}
	messageID := hex.EncodeToString(event.Message.Header.MessageID)
	return seq, messageID, nil
}

func (a *TONAdapter) CCIPReceiver() []byte {
	receiverAddr, err := a.getAddress("Receiver")
	if err != nil {
		panic(err)
	}
	ac := codec.NewAddressCodec()
	receiver, err := ac.AddressStringToBytes(receiverAddr.String())
	if err != nil {
		panic(fmt.Sprintf("failed to convert TON address to bytes: %v", err))
	}
	return receiver
}

func (a *TONAdapter) EOAReceiver(t *testing.T) []byte {
	receiverAddr := a.WalletAddress
	ac := codec.NewAddressCodec()
	receiver, err := ac.AddressStringToBytes(receiverAddr.String())
	require.NoError(t, err, "failed to convert TON address to bytes")
	return receiver
}

func (a *TONAdapter) InvalidAddresses() [][]byte {
	ac := codec.NewAddressCodec()
	zeroAddress, err := ac.AddressStringToBytes(tvm.ZeroAddress.String())
	if err != nil {
		panic(fmt.Sprintf("failed to convert TON address to bytes: %v", err))
	}

	return [][]byte{
		{99},
		zeroAddress,
	}
}

func (a *TONAdapter) SetReceiverRejectAll(ctx context.Context, t *testing.T, rejectAll bool) error {
	receiverAddr, err := a.getAddress("Receiver")
	if err != nil {
		return err
	}

	behavior := receiver.BehaviorAccept
	if rejectAll {
		behavior = receiver.BehaviorRejectAll
	}
	bodyCell, err := tlb.ToCell(receiver.UpdateBehavior{Behavior: behavior})
	if err != nil {
		return err
	}
	tx, _, err := a.Wallet.SendWaitTransaction(ctx, &wallet.Message{
		Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     &receiverAddr,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        bodyCell,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to send transaction: %w", err)
	}
	msg, err := tracetracking.MapToReceivedMessage(tx)
	if err != nil {
		return fmt.Errorf("failed to map tx to ReceivedMessage: %w", err)
	}
	err = msg.WaitForTrace(ctx, a.Client)
	if err != nil {
		return fmt.Errorf("failed to wait for trace: %w", err)
	}
	t.Logf("Receiver Reject All %v:\n%s", rejectAll, debug.NewDebuggerSequenceTrace(nil, sequenceDiagram.OutputFmtURL).DumpReceived(&msg))
	return nil
}

func (a *TONAdapter) NativeFeeToken() string {
	return tvm.TonTokenAddr.String()
}

func (a *TONAdapter) GetExtraArgs(receiver []byte, sourceFamily string, opts ...testadapters.ExtraArgOpt) ([]byte, error) {
	switch sourceFamily {
	case chain_selectors.FamilyEVM:
		// defaults
		extraArgs := extraargs.ClientGenericExtraArgsV2{
			GasLimit:                 new(big.Int).SetUint64(100_000_000),
			AllowOutOfOrderExecution: true,
		}
		// override via options
		for _, opt := range opts {
			switch opt.Name {
			case testadapters.ExtraArgGasLimit:
				extraArgs.GasLimit = opt.Value.(*big.Int)
			case testadapters.ExtraArgOOO:
				extraArgs.AllowOutOfOrderExecution = opt.Value.(bool)
			default:
				return nil, fmt.Errorf("unsupported extra arg: %s", opt.Name)
			}
		}
		return extraargs.SerializeClientGenericExtraArgsV2(extraArgs)
	case chain_selectors.FamilyTon:
		return nil, nil
	case chain_selectors.FamilySolana:
		// Solana -> TON: Solana fee quoter expects Borsh-encoded GenericExtraArgsV2 with OOO=true
		// for non-SVM destinations. Format: [4-byte BE tag][Borsh data]
		gasLimit := ag_binary.Uint128{Lo: 100_000_000}
		ooo := true
		for _, opt := range opts {
			switch opt.Name {
			case testadapters.ExtraArgGasLimit:
				gasLimit = ag_binary.Uint128{Lo: opt.Value.(*big.Int).Uint64()}
			case testadapters.ExtraArgOOO:
				ooo = opt.Value.(bool)
			default:
				return nil, fmt.Errorf("unsupported extra arg: %s", opt.Name)
			}
		}
		type borshGenericExtraArgsV2 struct {
			GasLimit                 ag_binary.Uint128
			AllowOutOfOrderExecution bool
		}
		data, err := ag_binary.MarshalBorsh(borshGenericExtraArgsV2{
			GasLimit:                 gasLimit,
			AllowOutOfOrderExecution: ooo,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to borsh-serialize extra args: %w", err)
		}
		// Tag: bytes4(keccak256("CCIP EVMExtraArgsV2")) = 0x181dcf10
		tag := []byte{0x18, 0x1d, 0xcf, 0x10} //nolint:prealloc //  - TODO(lint-migration): golangci-lint 2.11 rule tightened
		return append(tag, data...), nil
	default:
		// TODO: add support for other families
		return nil, fmt.Errorf("unsupported source family: %s", sourceFamily)
	}
}

func (a *TONAdapter) LowGasLimit() *big.Int {
	return tlb.MustFromTON("0.001").Nano()
}

func (a *TONAdapter) GetInboundNonce(ctx context.Context, sender []byte, srcSel uint64) (uint64, error) {
	return 0, errors.ErrUnsupported
}

func (a *TONAdapter) ValidateCommit(t *testing.T, sourceSelector uint64, startBlock *uint64, seqNumRange ccipocr3.SeqNumRange) {
	offRamp, err := a.getAddress("OffRamp")
	require.NoError(t, err)
	_, err = confirmCommitWithExpectedSeqNumRangeTON(
		t,
		sourceSelector,
		a.Chain,
		offRamp,
		seqNumRange,
	)
	require.NoError(t, err)
}

func (a *TONAdapter) ValidateExecSucceeds(t *testing.T, sourceSelector uint64, startBlock *uint64, seqNrs []uint64) (execStates map[uint64]int) {
	offRamp, err := a.getAddress("OffRamp")
	require.NoError(t, err)
	execStates, err = confirmExecWithExpectedSeqNrsTON(
		t,
		sourceSelector,
		a.Chain,
		offRamp,
		startBlock,
		seqNrs,
	)
	require.NoError(t, err)
	return execStates
}

func (a *TONAdapter) ValidateExecFails(t *testing.T, sourceSelector uint64, startBlock *uint64, seqNrs []uint64) {
	offRamp, err := a.getAddress("OffRamp")
	require.NoError(t, err)
	executionStates, err := confirmExecWithExpectedSeqNrsTON(
		t,
		sourceSelector,
		a.Chain,
		offRamp,
		startBlock,
		seqNrs,
	)
	require.NoError(t, err)
	for _, seqNr := range seqNrs {
		state, ok := executionStates[seqNr]
		require.True(t, ok, "no execution state found for seqNr %d", seqNr)
		require.Equal(t, int(utils.EXECUTION_STATE_FAILURE), state,
			"expected execution state FAILURE for seqNr %d, got state %d", seqNr, state)
	}
}

func (a *TONAdapter) AllowRouterToWithdrawTokens(ctx context.Context, tokenAddress string, amount *big.Int) error {
	// Real jetton approval (e.g. minting an allowance / notifying the pool) is not
	// yet implemented; no tokens actually move so there is nothing to approve yet.
	return nil
}

func (a *TONAdapter) GetTokenBalance(ctx context.Context, tokenAddress string, ownerAddress []byte) (*big.Int, error) {
	minterAddr, err := address.ParseAddr(tokenAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to parse token address %q: %w", tokenAddress, err)
	}

	ac := codec.NewAddressCodec()
	ownerAddrStr, err := ac.AddressBytesToString(ownerAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to convert owner address bytes to string: %w", err)
	}
	ownerAddr, err := address.ParseAddr(ownerAddrStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse owner address %q: %w", ownerAddrStr, err)
	}

	walletAddr, err := tvm.CallGetterLatest(ctx, a.Client, minterAddr, minter.GetWalletAddress, ownerAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to derive jetton wallet address for owner %q: %w", ownerAddrStr, err)
	}

	balance, err := tvm.CallGetterLatest(ctx, a.Client, walletAddr, jettonwallet.GetWalletData)
	if err != nil {
		// The jetton wallet contract has not been deployed yet (no transfer has ever
		// landed for this owner), so treat it as a zero balance rather than an error.
		return big.NewInt(0), nil
	}

	return balance, nil
}

func (a *TONAdapter) GetTokenExpansionConfig() (*tokensapi.TokenExpansionInputPerChain, error) {
	if os.Getenv("TON_TOKEN_TRANSFERS_ENABLED") == "" {
		return nil, errors.ErrUnsupported
	}

	suffix := strconv.FormatUint(a.Selector, 10) + "-" + chain_selectors.FamilyTon
	registryAddr, err := a.GetRegistryAddress()
	if err != nil {
		return nil, fmt.Errorf("failed to get registry address: %w", err)
	}

	preMintAmount := uint64(1_000_000) // pre-mint 1 million tokens
	return &tokensapi.TokenExpansionInputPerChain{
		TokenPoolVersion: semver.MustParse("1.6.0"),
		DeployTokenInput: &tokensapi.DeployTokenInput{
			Decimals:      9,
			Symbol:        "TEST_TOKEN_" + suffix,
			Name:          "TEST TOKEN " + suffix,
			Type:          deployment.ContractType(bindings.ShortJettonMinter),
			PreMint:       &preMintAmount,
			Senders:       []string{a.WalletAddress.String()},
			ExternalAdmin: a.WalletAddress.String(),
			CCIPAdmin:     a.WalletAddress.String(),
		},
		DeployTokenPoolInput: &tokensapi.DeployTokenPoolInput{
			PoolType:           bindings.ShortMockTokenPool,
			TokenPoolQualifier: "TEST TOKEN POOL " + suffix,
		},
		TokenTransferConfig: &tokensapi.TokenTransferConfig{
			ChainSelector: a.Selector,
			RegistryRef: datastore.AddressRef{
				ChainSelector: a.Selector,
				Address:       registryAddr,
			},
			RemoteChains: map[uint64]tokensapi.RemoteChainConfig[*datastore.AddressRef, datastore.AddressRef]{},
		},
		// UpdateAuthorities is a no-op for the TON token adapter today, so skip it
		// rather than sending a transaction that isn't backed by real behavior.
		SkipOwnershipTransfer: true,
	}, nil
}

func (a *TONAdapter) GetRegistryAddress() (string, error) {
	// The Router works as the TokenAdminRegistry parent contract for now
	addr, err := a.getAddress(state.Router)
	if err != nil {
		return "", fmt.Errorf("failed to get Router address: %w", err)
	}
	return addr.String(), nil
}

func (a *TONAdapter) CurrentBlock(t *testing.T) uint64 {
	info, err := a.Client.GetMasterchainInfo(t.Context())
	require.NoError(t, err)
	return uint64(info.SeqNo)
}

func (a *TONAdapter) SetAllowlist(t *testing.T, destChainSelector uint64, enabled bool) error {
	routerStr, err := a.state.GetAddress(state.Router)
	if err != nil {
		return fmt.Errorf("failed to get router address: %w", err)
	}
	routerAddr := address.MustParseAddr(routerStr)
	onrampStr, err := a.state.GetAddress(state.OnRamp)
	if err != nil {
		return fmt.Errorf("failed to get onramp address: %w", err)
	}
	onrampAddr := address.MustParseAddr(onrampStr)
	msg := onramp.UpdateDestChainConfigsMessage{
		Updates: common.SnakedCell[onramp.UpdateDestChainConfig]{
			onramp.UpdateDestChainConfig{
				DestinationChainSelector: destChainSelector,
				Router:                   routerAddr,
				AllowListEnabled:         enabled,
			},
		},
	}

	bodyCell, err := tlb.ToCell(msg)
	if err != nil {
		return fmt.Errorf("failed to convert allowlist update message to cell: %w", err)
	}
	tx, _, err := a.Wallet.SendWaitTransaction(t.Context(), &wallet.Message{
		Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     onrampAddr,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        bodyCell,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to send allowlist update transaction: %w", err)
	}
	err = tracetracking.WaitForTrace(t.Context(), a.Client, tx)
	if err != nil {
		return fmt.Errorf("failed to wait for allowlist update message: %w", err)
	}
	return nil
}

func (a *TONAdapter) UpdateSenderAllowlistStatus(t *testing.T, destChainSelector uint64, included bool) error {
	onrampStr, err := a.state.GetAddress(state.OnRamp)
	if err != nil {
		return fmt.Errorf("failed to get onramp address: %w", err)
	}
	onrampAddr := address.MustParseAddr(onrampStr)
	add, remove := func() (common.SnakedCell[common.AddressWrap], common.SnakedCell[common.AddressWrap]) {
		sender := common.SnakedCell[common.AddressWrap]{
			common.AddressWrap{
				Val: a.Wallet.WalletAddress(),
			},
		}
		if included {
			return sender, common.SnakedCell[common.AddressWrap]{}
		}
		return common.SnakedCell[common.AddressWrap]{}, sender
	}()
	updates := common.SnakedCell[onramp.UpdateAllowlist]{
		onramp.UpdateAllowlist{
			DestinationChainSelector: destChainSelector,
			Add:                      add,
			Remove:                   remove,
		},
	}
	msg := onramp.UpdateAllowlists{
		Updates: updates,
	}

	bodyCell, err := tlb.ToCell(msg)
	if err != nil {
		return fmt.Errorf("failed to convert allowlist update message to cell: %w", err)
	}
	tx, _, err := a.Wallet.SendWaitTransaction(t.Context(), &wallet.Message{
		Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     onrampAddr,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        bodyCell,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to send allowlist update transaction: %w", err)
	}
	err = tracetracking.WaitForTrace(t.Context(), a.Client, tx)
	if err != nil {
		return fmt.Errorf("failed to wait for allowlist update message: %w", err)
	}
	return nil
}

func (a *TONAdapter) RMNCursed(t *testing.T, chainSelector uint64, cursed bool) error {
	routerStr, err := a.state.GetAddress(state.Router)
	if err != nil {
		return fmt.Errorf("failed to get router address: %w", err)
	}
	routerAddr := address.MustParseAddr(routerStr)
	queryID, err := tvm.RandomQueryID()
	if err != nil {
		return fmt.Errorf("failed to generate random query ID: %w", err)
	}
	subjects := common.SnakedCell[router.Subject]{
		router.Subject{
			Value: new(big.Int).SetUint64(chainSelector),
		},
	}

	bodyCell, err := func() (*cell.Cell, error) {
		if cursed {
			return tlb.ToCell(router.RMNRemoteCurse{
				QueryID:  queryID,
				Subjects: subjects,
			})
		}
		return tlb.ToCell(router.RMNRemoteUncurse{
			QueryID:  queryID,
			Subjects: subjects,
		})
	}()
	if err != nil {
		return fmt.Errorf("failed to convert message to cell: %w", err)
	}
	tx, _, err := a.Wallet.SendWaitTransaction(t.Context(), &wallet.Message{
		Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     routerAddr,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        bodyCell,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to send rmn transaction: %w", err)
	}
	err = tracetracking.WaitForTrace(t.Context(), a.Client, tx)
	if err != nil {
		return fmt.Errorf("failed to wait for rmn message: %w", err)
	}
	return nil
}

// SendCCIPMessage sends a CCIP request from a TON chain using the standard router.CCIPSend message.
func SendCCIPMessage(
	ctx context.Context,
	chain cldf_ton.Chain,
	state testadapters.StateProvider,
	sourceChain uint64,
	msg router.CCIPSend) (uint64, any, error) {
	clientConn := chain.Client

	l, err := logger.New()
	if err != nil {
		return 0, nil, err
	}

	rawRouterAddr, err := state.GetAddress("Router")
	if err != nil {
		return 0, nil, err
	}
	routerAddr := address.MustParseAddr(rawRouterAddr)

	rawFeeQuoterAddr, err := state.GetAddress("FeeQuoter")
	if err != nil {
		return 0, nil, err
	}
	feeQuoterAddr := address.MustParseAddr(rawFeeQuoterAddr)

	ccipSendCell, err := tlb.ToCell(msg)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to convert to cell: %w", err)
	}

	l.Infof("Getting Fee to send CCIP request from chain selector %d to chain selector %d",
		sourceChain, msg.DestChainSelector)

	fee, err := getValidatedFee(ctx, clientConn, feeQuoterAddr, ccipSendCell)
	if err != nil {
		return 0, nil, err
	}
	l.Infof("Fee to send CCIP request: %s nano TON", fee.String())

	value := big.NewInt(0).Add(fee, tlb.MustFromTON("3").Nano() /* To cover for gas */)

	knownAddresses := map[string]debug.TypeAndVersion{
		routerAddr.String():    {Type: "Router", Version: *semver.MustParse("0.0.0")},
		feeQuoterAddr.String(): {Type: "FeeQuoter", Version: *semver.MustParse("0.0.0")},
	}

	return sendCellAndAwaitCCIPMessageSent(ctx, chain, sourceChain, routerAddr, ccipSendCell, value, knownAddresses)
}

// SendTokenTransferMessage sends a CCIP token transfer request from a TON chain. The jetton
// AskToTransfer message is sent to the sender's own jetton wallet (msg.OwnedJettonWallet), which
// forwards the tokens to the Router along with the CCIPSend message carried in the transfer's
// forward payload.
func SendTokenTransferMessage(
	ctx context.Context,
	chain cldf_ton.Chain,
	state testadapters.StateProvider,
	sourceChain uint64,
	msg TokenTransferMessage) (uint64, any, error) {
	clientConn := chain.Client

	l, err := logger.New()
	if err != nil {
		return 0, nil, err
	}

	rawFeeQuoterAddr, err := state.GetAddress("FeeQuoter")
	if err != nil {
		return 0, nil, err
	}
	feeQuoterAddr := address.MustParseAddr(rawFeeQuoterAddr)

	l.Infof("Getting Fee to send CCIP token transfer from chain selector %d", sourceChain)

	fee, err := getValidatedFee(ctx, clientConn, feeQuoterAddr, msg.Transfer.ForwardPayload)
	if err != nil {
		return 0, nil, err
	}
	l.Infof("Fee to send CCIP token transfer: %s nano TON", fee.String())

	transferCell, err := tlb.ToCell(msg.Transfer)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to convert token transfer message to cell: %w", err)
	}

	// The attached value must cover the CCIP fee (forwarded on to the Router alongside the
	// tokens via ForwardTonAmount) plus gas for the jetton wallet -> jetton wallet -> Router
	// notification hops.
	value := big.NewInt(0).Add(fee, msg.Transfer.ForwardTonAmount.Nano())
	value = value.Add(value, tlb.MustFromTON("0.5").Nano() /* To cover for gas */)

	knownAddresses := map[string]debug.TypeAndVersion{
		msg.OwnedJettonWallet.String(): {Type: "OwnedJettonWallet", Version: *semver.MustParse("0.0.0")},
		feeQuoterAddr.String():         {Type: "FeeQuoter", Version: *semver.MustParse("0.0.0")},
	}

	return sendCellAndAwaitCCIPMessageSent(ctx, chain, sourceChain, msg.OwnedJettonWallet, transferCell, value, knownAddresses)
}

// getValidatedFee queries the FeeQuoter for the fee (in native TON) required to send ccipSendCell.
func getValidatedFee(ctx context.Context, clientConn ton.APIClientWrapped, feeQuoterAddr *address.Address, ccipSendCell *cell.Cell) (*big.Int, error) {
	block, err := clientConn.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current masterchain info: %w", err)
	}
	waiterClient := clientConn.WaitForBlock(block.SeqNo)
	getResult, err := waiterClient.RunGetMethod(ctx, block, feeQuoterAddr, "validatedFeeCell", ccipSendCell)
	if err != nil {
		return nil, fmt.Errorf("failed to get validatedFee: %w", err)
	}

	fee, err := getResult.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to get fee: %w", err)
	}
	return fee, nil
}

// sendCellAndAwaitCCIPMessageSent sends bodyCell with the given value to dstAddr, waits for the
// transaction trace to complete, and flattens the resulting message tree looking for the
// onramp.CCIPMessageSent event emitted once the request reaches the OnRamp.
func sendCellAndAwaitCCIPMessageSent(
	ctx context.Context,
	chain cldf_ton.Chain,
	sourceChain uint64,
	dstAddr *address.Address,
	bodyCell *cell.Cell,
	value *big.Int,
	knownAddresses map[string]debug.TypeAndVersion,
) (uint64, any, error) {
	senderWallet := chain.Wallet
	senderAddr := chain.WalletAddress
	clientConn := chain.Client

	l, err := logger.New()
	if err != nil {
		return 0, nil, err
	}

	l.Infof("(Ton) Sending request from chain selector %d to address %s using sender %s",
		sourceChain, dstAddr.String(), senderAddr.String())

	block, err := clientConn.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to get current masterchain info: %w", err)
	}
	waiterClient := clientConn.WaitForBlock(block.SeqNo)

	// Check sender balance before sending
	senderAccount, err := waiterClient.GetAccount(ctx, block, senderAddr)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to get sender account: %w", err)
	}
	senderBalance := senderAccount.State.Balance.Nano()
	l.Infof("Sender balance: %s nano TON, required value: %s nano TON", senderBalance.String(), value.String())
	if senderBalance.Cmp(value) < 0 {
		return 0, nil, fmt.Errorf("insufficient balance: sender has %s nano TON but needs %s nano TON", senderBalance.String(), value.String())
	}

	walletMsg := &wallet.Message{
		Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      false,
			DstAddr:     dstAddr,
			Amount:      tlb.MustFromNano(value, 9),
			Body:        bodyCell,
		},
	}

	ttConn := tracetracking.NewSignedAPIClient(clientConn, *senderWallet)
	receivedMsg, blockID, err := ttConn.SendWaitTransaction(ctx, *dstAddr, walletMsg)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to send transaction: %w", err)
	}

	exitCode, err := receivedMsg.ExitCode()
	if err != nil {
		return 0, nil, fmt.Errorf("failed to get exit code: %w", err)
	}
	if exitCode != tvm.ExitCodeSuccess {
		return 0, nil, fmt.Errorf("transaction failed: with exitcode %d: %s", exitCode, exitCode.Describe())
	}

	l.Infow("transaction sent", "blockID", blockID, "receivedMsg", receivedMsg)
	err = receivedMsg.WaitForTrace(ctx, clientConn)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to wait for trace: %w", err)
	}

	// TODO: This is temporary debugging code to be removed later
	knownAddresses[senderAddr.String()] = debug.TypeAndVersion{Type: "SenderWallet", Version: *semver.MustParse("0.0.0")}
	l.Infof("Msg tree trace:\n%s\n", debug.NewDebuggerTreeTrace(knownAddresses).DumpReceived(receivedMsg))
	l.Infof("Msg sequence diagram:\n%s\n", debug.NewDebuggerSequenceTrace(knownAddresses, sequenceDiagram.OutputFmtURL).DumpReceived(receivedMsg))

	event, err := waitForReceivedMsgFlatten(ctx, l, clientConn, receivedMsg)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to get CCIPMessageSent from flattening received messages: %w", err)
	}
	return event.Message.Header.SequenceNumber, event, nil
}

func waitForReceivedMsgFlatten(ctx context.Context, l logger.Logger, clientConn ton.APIClientWrapped, msg *tracetracking.ReceivedMessage) (onramp.CCIPMessageSent, error) {
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

		l.Infof("Flattening %d outgoing internal messages", len(currentMsg.OutgoingInternalReceivedMessages))

		for i, outMsg := range currentMsg.OutgoingInternalReceivedMessages {
			outExitCode, outErr := outMsg.ExitCode()
			l.Infof("Outgoing message %d: exit code %v (err=%v), succeeded: %v, bounced: %v, status: %v",
				i, outExitCode, outErr, outMsg.Succeeded(), outMsg.EmittedBouncedMessage, outMsg.Status())

			if outErr == nil && outExitCode != tvm.ExitCodeSuccess {
				l.Errorf("Outgoing message %d failed with exit code %v", i, outExitCode)
			}
			if !outMsg.Succeeded() {
				l.Errorf("Outgoing message %d was not successful", i)
			}
			if outMsg.EmittedBouncedMessage {
				l.Errorf("Outgoing message %d was bounced", i)
			}

			err := outMsg.WaitForTrace(ctx, clientConn)
			if err != nil {
				l.Errorf("failed to wait for trace: %v", err)
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
		l.Errorf("failed to parse CCIPMessageSent from cell: %v", err)
		return onramp.CCIPMessageSent{}, err
	}

	return event, nil
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
	t *testing.T,
	lggr logger.Logger,
	tonChain cldf_ton.Chain,
	contract *address.Address,
	eventName string,
) tonlogpoller.Service {
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
	require.NoError(t, err)
	require.NoError(t, service.Start(ctx))

	return service
}

// waitForTONEvent sets up a logpoller and waits for events matching the given criteria.
// Handles service lifecycle and common error patterns.
func waitForTONEvent[T any](
	t *testing.T,
	tonChain cldf_ton.Chain,
	offRamp *address.Address,
	eventName string,
	loggerName string,
	processEvent func(lggr logger.Logger, event tonlptypes.TypedLog[T]) (done bool, err error),
) error {
	ctx := t.Context()
	lggr := logger.Named(logger.Test(t), loggerName)

	service := setupLogPoller(ctx, t, lggr, tonChain, offRamp, eventName)
	defer func() {
		if err := service.Close(); err != nil {
			lggr.Errorw("failed to close service", "err", err)
		}
	}()
	eventSig := hash.CRC32(eventName)
	deadline := time.Now().Add(tests.WaitTimeout(t))
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
			lggr.Infow("Still waiting",
				"eventName", eventName,
				"elapsed", time.Since(startTime).Round(time.Second).String())

		case <-ticker.C:
			if time.Now().After(deadline) {
				return ErrTimeout
			}

			logs, _, _, err := service.NewQuery().
				WithSource(offRamp).
				WithEventSig(eventSig).
				Execute(ctx)
			if err != nil {
				lggr.Warnw("Failed to query logs", "error", err)
				continue
			}

			events, err := tonlpquery.DecodedLogs[T](logs)
			if err != nil {
				lggr.Warnw("Failed to decode logs", "error", err)
				continue
			}

			for _, event := range events {
				eventKey := fmt.Sprintf("%d-%d", event.TxLT, event.MsgIndex)
				if seenEvents[eventKey] {
					continue
				}
				seenEvents[eventKey] = true

				done, err := processEvent(lggr, event)
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

// confirmCommitWithExpectedSeqNumRangeTON waits for a commit report that covers the expected sequence number range.
func confirmCommitWithExpectedSeqNumRangeTON(
	t *testing.T,
	srcChainSelector uint64,
	tonChain cldf_ton.Chain,
	offRamp address.Address,
	expectedSeqNums ccipocr3.SeqNumRange,
) (bool, error) {
	tracker := testadapters.NewCommitReportTracker(srcChainSelector, expectedSeqNums)
	reportsProcessed := 0

	err := waitForTONEvent(t, tonChain, &offRamp, consts.EventNameCommitReportAccepted, "TON_EVENT_ASSERTION:COMMIT",
		func(lggr logger.Logger, event tonlptypes.TypedLog[offramp.CommitReportAccepted]) (bool, error) {
			mr := event.TypedData.MerkleRoot
			if mr == nil {
				return false, nil // Skip price-only updates
			}

			if mr.SourceChainSelector != srcChainSelector {
				lggr.Warnw("Received commit report for unexpected source chain", "expected", srcChainSelector, "actual", mr.SourceChainSelector)
				return false, nil // Skip reports from other source chains
			}
			reportsProcessed++
			lggr.Infow("Received commit", "seqNums", fmt.Sprintf("[%d, %d]", mr.MinSeqNr, mr.MaxSeqNr))

			tracker.VisitCommitReport(srcChainSelector, mr.MinSeqNr, mr.MaxSeqNr)

			// Check if all messages committed (single or multiple reports)
			if (uint64(expectedSeqNums.Start()) >= mr.MinSeqNr && uint64(expectedSeqNums.End()) <= mr.MaxSeqNr) ||
				tracker.AllCommitted(srcChainSelector) {
				t.Logf("All sequence numbers committed [%d, %d]", expectedSeqNums.Start(), expectedSeqNums.End())
				return true, nil
			}

			return false, nil
		})

	if errors.Is(err, ErrTimeout) {
		return false, fmt.Errorf("timed out waiting for commit on chain %d from source %d, seq nums %s (%d reports processed): %w",
			tonChain.Selector, srcChainSelector, expectedSeqNums.String(), reportsProcessed, err)
	}
	return err == nil, err
}

// confirmExecWithExpectedSeqNrsTON waits for execution state changes on TON for the given sequence numbers.
// Returns a map of sequence number to execution state.
func confirmExecWithExpectedSeqNrsTON(
	t *testing.T,
	srcChainSelector uint64,
	tonChain cldf_ton.Chain,
	offRamp address.Address,
	startBlock *uint64,
	expectedSeqNums []uint64,
) (map[uint64]int, error) {
	if len(expectedSeqNums) == 0 {
		return nil, errors.New("no expected sequence numbers provided")
	}

	executionStates := make(map[uint64]int)
	pending := make(map[uint64]bool)
	for _, seqNum := range expectedSeqNums {
		pending[seqNum] = true
	}
	eventsProcessed := 0

	err := waitForTONEvent(t, tonChain, &offRamp, consts.EventNameExecutionStateChanged, "TON_EVENT_ASSERTION:EXEC",
		func(lggr logger.Logger, event tonlptypes.TypedLog[offramp.ExecutionStateChanged]) (bool, error) {
			exec := event.TypedData

			_, seen := executionStates[exec.SequenceNumber]
			if exec.SourceChainSelector != srcChainSelector ||
				(!pending[exec.SequenceNumber] && !seen) ||
				(startBlock != nil && uint64(event.MCBlockSeqno) < *startBlock) {
				return false, nil
			}

			eventsProcessed++

			switch exec.State {
			case utils.EXECUTION_STATE_INPROGRESS:
				return false, nil

			case utils.EXECUTION_STATE_FAILURE:
				executionStates[exec.SequenceNumber] = int(exec.State)
				delete(pending, exec.SequenceNumber)
				lggr.Errorw("Execution failed", "sequenceNumber", exec.SequenceNumber, "messageID", hex.EncodeToString(exec.MessageID))

				if len(pending) == 0 {
					t.Logf("All sequence numbers executed (with failures): %v", expectedSeqNums)
					return true, nil
				}

			case utils.EXECUTION_STATE_SUCCESS:
				executionStates[exec.SequenceNumber] = int(exec.State)
				delete(pending, exec.SequenceNumber)
				lggr.Infow("Execution successful", "sequenceNumber", exec.SequenceNumber, "remaining", len(pending))

				if len(pending) == 0 {
					t.Logf("All sequence numbers executed: %v", expectedSeqNums)
					return true, nil
				}

			default:
				lggr.Warnw("Unknown execution state", "state", exec.State, "sequenceNumber", exec.SequenceNumber)
			}

			return false, nil
		})

	if errors.Is(err, ErrTimeout) {
		missing := make([]uint64, 0, len(pending))
		for seqNum := range pending {
			missing = append(missing, seqNum)
		}
		return executionStates, fmt.Errorf("timed out waiting for execution on chain %d from source %d, missing: %v (%d events, %d successful): %w",
			tonChain.Selector, srcChainSelector, missing, eventsProcessed, len(executionStates), err)
	}
	return executionStates, err
}
