package jetton

import (
	"fmt"
	"math/big"
	"os"
	"slices"
	"strings"
	"testing"

	jetton_wrappers "integration-tests/jetton/wrappers"
	"integration-tests/tracetracking/testutils"
	"path"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/jetton"
	"github.com/xssnick/tonutils-go/ton/nft"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

const (
	OnchainContentPrefix  = 0x00
	OffchainContentPrefix = 0x01
)

var PathContractsJetton = os.Getenv("PATH_CONTRACTS_JETTON")

// Helper function to load the actual JettonWallet code
func loadJettonWalletCode() (*cell.Cell, error) {
	jettonWalletPath := path.Join(PathContractsJetton, "JettonWallet.compiled.json")
	compiledContract, err := wrappers.ParseCompiledContract(jettonWalletPath)
	if err != nil {
		return nil, fmt.Errorf("failed to parse JettonWallet contract: %w", err)
	}
	return compiledContract, nil
}

const JettonDataURI = "smartcontract.com"

var jettonMintingAmount tlb.Coins = tlb.MustFromTON("100")

func TestJettonAll(t *testing.T) {
	// Common test setup
	type commonSetup struct {
		deployer         tracetracking.SignedAPIClient
		receiver         tracetracking.SignedAPIClient
		jettonMinter     *jetton_wrappers.JettonMinter
		jettonWalletCode *cell.Cell
		jettonClient     *jetton.Client
	}

	setUpCommon := func(t *testing.T) commonSetup {
		var setup commonSetup
		var err error
		var initialAmount = big.NewInt(1_000_000_000_000)
		accounts := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 2)
		setup.deployer = accounts[0]
		setup.receiver = accounts[1]

		t.Logf("\n\n\n\n\n\nJetton Test Setup\n==========================\n")

		// Create jetton content
		defaultContent := createStringCell(t, JettonDataURI)

		// Load the actual JettonWallet code
		setup.jettonWalletCode, err = loadJettonWalletCode()
		require.NoError(t, err, "failed to load JettonWallet code")

		// Deploy jetton minter
		t.Logf("Deploying JettonMinter contract\n")
		setup.jettonMinter, err = jetton_wrappers.NewJettonMinterProvider(setup.deployer).Deploy(jetton_wrappers.JettonMinterInitData{
			TotalSupply:   big.NewInt(0),
			Admin:         setup.deployer.Wallet.WalletAddress(),
			TransferAdmin: nil,
			WalletCode:    setup.jettonWalletCode,
			JettonContent: defaultContent,
		})
		require.NoError(t, err, "failed to deploy JettonMinter contract")
		t.Logf("JettonMinter contract deployed at %s\n", setup.jettonMinter.Contract.Address.String())

		setup.jettonClient = jetton.NewJettonMasterClient(setup.deployer.Client, setup.jettonMinter.Contract.Address)

		return setup
	}

	type senderSetup struct {
		common commonSetup
		sender *jetton_wrappers.JettonSender
	}

	setupJettonSender := func(t *testing.T) *senderSetup {
		setup := setUpCommon(t)

		// Deploy jetton sender contract
		t.Logf("Deploying JettonSender contract\n")
		jettonSender, err := jetton_wrappers.NewJettonSenderProvider(setup.deployer).Deploy(jetton_wrappers.JettonSenderInitData{
			MasterAddress:    setup.jettonMinter.Contract.Address,
			JettonWalletCode: setup.jettonWalletCode,
		})
		require.NoError(t, err, "failed to deploy JettonSender contract")
		t.Logf("JettonSender contract deployed at %s\n", jettonSender.Contract.Address.String())

		// Mint jettons to sender contract
		t.Logf("Minting jettons to sender contract\n")
		sendMintMsg, err := setup.jettonMinter.SendMint(
			tlb.MustFromTON("0.05"),
			jettonSender.Contract.Address,
			tlb.MustFromTON("0.05"),
			jettonMintingAmount,
			setup.deployer.Wallet.WalletAddress(),
			setup.deployer.Wallet.WalletAddress(),
			jetton_wrappers.ForwardPayload{},
			tlb.ZeroCoins,
		)
		require.NoError(t, err, "failed to mint jettons")
		t.Logf("Msg trace:\n%s\n", replaceAddresses(
			map[string]string{
				setup.deployer.Wallet.Address().String():     "Deployer",
				jettonSender.Contract.Address.String():       "JettonSender",
				setup.jettonMinter.Contract.Address.String(): "JettonMinter",
			},
			sendMintMsg.Dump()))

		require.Zero(t, sendMintMsg.ExitCode, "Msg to wallet should have exit code 0")
		require.Len(t, sendMintMsg.OutgoingInternalReceivedMessages, 1, "Msg to wallet should have 1 outgoing message")
		msgToMinter := sendMintMsg.OutgoingInternalReceivedMessages[0]
		require.Zero(t, msgToMinter.ExitCode, "Msg to minter should have exit code 0")
		require.Len(t, msgToMinter.OutgoingInternalReceivedMessages, 1, "Msg to minter should have 1 outgoing message")
		msgToJettonWallet := msgToMinter.OutgoingInternalReceivedMessages[0]
		require.Zero(t, msgToJettonWallet.ExitCode, "Msg to jetton wallet should have exit code 0")
		require.Len(t, msgToJettonWallet.OutgoingInternalReceivedMessages, 1, "Msg to jetton wallet should not have outgoing messages")
		msgReturnExcessesBack := msgToJettonWallet.OutgoingInternalReceivedMessages[0]
		require.Zero(t, msgReturnExcessesBack.ExitCode, "Msg to return excesses should have exit code 0")
		require.Empty(t, msgReturnExcessesBack.OutgoingInternalReceivedMessages, "Msg to return excesses should have no outgoing messages")
		senderJettonWalletAddress := msgToJettonWallet.InternalMsg.DstAddr

		senderJettonWallet, err := setup.jettonClient.GetJettonWallet(t.Context(), jettonSender.Contract.Address)
		require.NoError(t, err, "failed to get receiver wallet")
		require.Equal(t, senderJettonWalletAddress, senderJettonWallet.Address(), "Jetton Wallet Address calculated by master contract should match the cretaed one.")

		balance, err := senderJettonWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		require.Equal(t, jettonMintingAmount.Nano().Uint64(), balance.Uint64(), "Receiver wallet balance should match sent amount")

		t.Logf("Jettons minted successfully\n")

		return &senderSetup{
			common: setup,
			sender: jettonSender,
		}
	}

	type onrampMockSetup struct {
		common       commonSetup
		jettonSender *jetton_wrappers.JettonSender
		onrampMock   *jetton_wrappers.OnrampMock
	}

	setupOnrampMock := func(t *testing.T) *onrampMockSetup {
		setup := setupJettonSender(t)
		// Deploy onramp mock contract
		t.Logf("Deploying OnrampMock contract\n")
		onrampMock, err := jetton_wrappers.NewOnrampMockProvider(setup.common.deployer).Deploy(jetton_wrappers.OnrampMockInitData{
			MasterAddress:    setup.common.jettonMinter.Contract.Address,
			JettonWalletCode: setup.common.jettonWalletCode,
		})
		require.NoError(t, err, "failed to deploy OnrampMock contract")
		t.Logf("OnrampMock contract deployed at %s\n", onrampMock.Contract.Address.String())

		// Mint additional jettons to sender for onramp tests if needed
		_, err = setup.common.jettonMinter.SendMint(
			tlb.MustFromTON("0.05"),
			setup.sender.Contract.Address,
			tlb.MustFromTON("0.05"),
			tlb.MustFromTON("1"),
			setup.common.deployer.Wallet.WalletAddress(),
			setup.common.deployer.Wallet.WalletAddress(),
			jetton_wrappers.ForwardPayload{},
			tlb.ZeroCoins,
		)
		require.NoError(t, err, "failed to mint additional jettons for onramp tests")

		return &onrampMockSetup{
			common:       setup.common,
			jettonSender: setup.sender,
			onrampMock:   &onrampMock,
		}
	}

	type simpleJettonReceiverSetup struct {
		common         commonSetup
		jettonSender   *jetton_wrappers.JettonSender
		simpleReceiver *jetton_wrappers.SimpleJettonReceiver
	}

	setupSimpleJettonReceiver := func(t *testing.T) *simpleJettonReceiverSetup {
		setup := setupJettonSender(t)

		// Deploy simple jetton receiver contract
		t.Logf("Deploying SimpleJettonReceiver contract\n")
		simpleJettonReceiver, err := jetton_wrappers.NewSimpleJettonReceiverProvider(setup.common.deployer).Deploy(jetton_wrappers.SimpleJettonReceiverInitData{
			MasterAddress:    setup.common.jettonMinter.Contract.Address,
			JettonWalletCode: setup.common.jettonWalletCode,
			AmountChecker:    tlb.MustFromTON("0").Nano().Uint64(),
			PayloadChecker:   nil,
		})
		require.NoError(t, err, "failed to deploy SimpleJettonReceiver contract")
		t.Logf("SimpleJettonReceiver contract deployed at %s\n", simpleJettonReceiver.Contract.Address.String())

		// Mint additional jettons to sender for receiver tests if needed
		_, err = setup.common.jettonMinter.SendMint(
			tlb.MustFromTON("0.05"),
			setup.sender.Contract.Address,
			tlb.MustFromTON("0.05"),
			tlb.MustFromTON("1"),
			setup.common.deployer.Wallet.WalletAddress(),
			setup.common.deployer.Wallet.WalletAddress(),
			jetton_wrappers.ForwardPayload{},
			tlb.ZeroCoins,
		)
		require.NoError(t, err, "failed to mint additional jettons for receiver tests")

		return &simpleJettonReceiverSetup{
			common:         setup.common,
			jettonSender:   setup.sender,
			simpleReceiver: &simpleJettonReceiver,
		}
	}

	// Test: Jetton Metadata
	t.Run("TestJettonMetadata", func(t *testing.T) {
		setup := setUpCommon(t)
		jettonData, err := setup.jettonMinter.GetJettonData()
		require.NoError(t, err, "failed to get jetton data")
		assert.Zero(t, jettonData.TotalSupply.Uint64(), "Total supply should be 0 TON")
		assert.True(t, setup.deployer.Wallet.WalletAddress().Equals(jettonData.AdminAddr), "Admin should be deployer")
		assert.NotNil(t, jettonData.Content, "Jetton content should not be nil")
		assert.NotNil(t, jettonData.WalletCode, "Wallet code should not be nil")
		assert.Equal(t, setup.jettonWalletCode.Hash(), jettonData.WalletCode.Hash(), "Jetton wallet code should match the deployed code")

		switch c := jettonData.Content.(type) {
		case *nft.ContentOnchain:
			t.Logf("On-chain content URI: %s\n", c.GetAttribute("name"))
			t.Logf("On-chain content URI: %s\n", c.GetAttribute("description"))
			t.Logf("On-chain content URI: %s\n", c.GetAttribute("image"))
			t.Fatal("On-chain content is not supported in this test, expected off-chain content")
		case *nft.ContentOffchain:
			assert.Equal(t, JettonDataURI, c.URI, "Off-chain content URI should match")
		case *nft.ContentSemichain:
			assert.Equal(t, JettonDataURI, c.URI, "Semichain content URI should match")
			t.Logf("Semichain content URI: %s\n", c.URI)
			t.Logf("On-chain content name: %s\n", c.GetAttribute("name"))
			t.Logf("On-chain content description: %s\n", c.GetAttribute("description"))
			t.Logf("On-chain content image: %s\n", c.GetAttribute("image"))
		}
	})

	// Test: Jetton Send and Receive (setup sender when needed)
	t.Run("TestJettonSendFastAutodeployWallet", func(t *testing.T) {
		setup := setupJettonSender(t)
		receiver := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ") // example address
		jettonAmount := tlb.MustFromTON("12")
		msgReceived, err := setup.sender.SendJettonsFast(
			jettonAmount,
			receiver,
		)
		require.NoError(t, err, "failed to send jettons in basic mode")
		t.Log("Jettons sent successfully")
		t.Logf("JettonSender message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String():     "Deployer",
			setup.sender.Contract.Address.String():              "JettonSender",
			setup.common.jettonMinter.Contract.Address.String(): "JettonMinter",
			receiver.String(): "Receiver",
		}, msgReceived.Dump()))

		receiverWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), receiver)
		require.NoError(t, err, "failed to get receiver wallet")
		balance, err := receiverWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, jettonAmount.Nano().Uint64(), balance.Uint64(), "Receiver wallet balance should match sent amount")
	})

	t.Run("TestJettonSendFastExistingWallet", func(t *testing.T) {
		setup := setupJettonSender(t)
		t.Logf("Deploying JettonMinter contract\n")
		receiverJettonWallet, err := jetton_wrappers.NewJettonWalletProvider(setup.common.receiver).Deploy(jetton_wrappers.JettonWalletInitData{
			Balance:             big.NewInt(0),
			OwnerAddress:        setup.common.receiver.Wallet.Address(),
			JettonMasterAddress: setup.common.jettonMinter.Contract.Address,
		})
		require.NoError(t, err, "failed to deploy JettonWallet contract")
		t.Logf("JettonWallet contract deployed at %s\n", receiverJettonWallet.Contract.Address.String())

		jettonAmount := tlb.MustFromTON("12")
		msgReceived, err := setup.sender.SendJettonsFast(
			jettonAmount,
			setup.common.receiver.Wallet.Address(),
		)
		require.NoError(t, err, "failed to send jettons in basic mode")
		t.Log("Jettons sent successfully")
		t.Logf("JettonSender message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String():     "Deployer",
			setup.sender.Contract.Address.String():              "JettonSender",
			setup.common.jettonMinter.Contract.Address.String(): "JettonMinter",
			setup.common.receiver.Wallet.Address().String():     "Receiver",
		}, msgReceived.Dump()))

		receiverWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.common.receiver.Wallet.Address())
		require.NoError(t, err, "failed to get receiver wallet")
		balance, err := receiverWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, jettonAmount.Nano().Uint64(), balance.Uint64(), "Receiver wallet balance should match sent amount")
	})

	t.Run("TestJettonSendExtended", func(t *testing.T) {
		setup := setupJettonSender(t)
		receiver := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ") // example address
		tonAmount := tlb.MustFromTON("0.1")
		jettonAmount := tlb.MustFromTON("12")
		forwardTonAmount := tlb.MustFromTON("0.01")

		customPayload := createStringCell(t, "custom_payload")
		forwardPayload := createStringCell(t, "forward_payload")

		msgJettonsExtended, err := setup.sender.SendJettonsExtended(
			tonAmount,
			jettonAmount,
			receiver,
			customPayload,
			forwardTonAmount,
			forwardPayload,
		)
		require.NoError(t, err, "failed to send jettons in basic mode")
		t.Logf("Sent jettons extended:\n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String():     "Deployer",
			setup.sender.Contract.Address.String():              "JettonSender",
			setup.common.jettonMinter.Contract.Address.String(): "JettonMinter",
			receiver.String(): "Receiver",
		}, msgJettonsExtended.Dump()))

		receiverWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), receiver)
		require.NoError(t, err, "failed to get receiver wallet")
		balance, err := receiverWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, jettonAmount.Nano().Uint64(), balance.Uint64(), "Receiver wallet balance should match sent amount")

		require.NoError(t, err, "failed to send jettons in extended mode")
		t.Logf("Extended jetton send test passed\n")

		t.Logf("All jetton send and receive tests completed successfully\n")
	})

	// Test: Jetton Onramp Mock (setup onramp when needed)
	t.Run("TestJettonOnrampMock", func(t *testing.T) {
		setup := setupOnrampMock(t)

		t.Logf("\n\n\n\n\n\nOnramp Mock Tests Started\n==========================\n")

		ccipRequest := "CALL step ON 0x AT evm"
		buf := []byte(ccipRequest)
		// this can be any payload that we want receiver to get with transfer notification
		jettonTransferPayload := cell.BeginCell().MustStoreSlice(buf, uint(len(buf))).EndCell()

		forwardTonAmount := tlb.MustFromTON("1")
		customPayload := cell.BeginCell().MustStoreBoolBit(true).EndCell()

		jettonSenderWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.jettonSender.Contract.Address)
		require.NoError(t, err, "failed to get jetton sender wallet")
		onrampMockJettonWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.onrampMock.Contract.Address)
		require.NoError(t, err, "failed to get onramp mock jetton wallet")

		sendCallWithAmount := func(jettonAmount tlb.Coins) (tracetracking.OutgoingExternalMessages, error) {
			msgReceived, err := setup.jettonSender.SendJettonsExtended(
				tlb.MustFromTON("2"),
				jettonAmount,
				setup.onrampMock.Contract.Address,
				jettonTransferPayload,
				forwardTonAmount,
				customPayload,
			)
			t.Logf("JettonSender message received: \n%s\n", replaceAddresses(map[string]string{
				setup.common.deployer.Wallet.Address().String():     "Deployer",
				setup.jettonSender.Contract.Address.String():        "JettonSender",
				jettonSenderWallet.Address().String():               "JettonSenderWallet",
				setup.common.jettonMinter.Contract.Address.String(): "JettonMinter",
				setup.onrampMock.Contract.Address.String():          "OnrampMock",
				onrampMockJettonWallet.Address().String():           "OnrampMockJettonWallet",
			}, msgReceived.Dump()))
			require.NoError(t, err, "failed to send jettons with custom payload")
			require.NotEmpty(t, msgReceived.OutgoingInternalReceivedMessages, "Outgoing internal messages should not be empty")
			msgToSender := msgReceived.OutgoingInternalReceivedMessages[0]
			require.NotEmpty(t, msgToSender.OutgoingInternalReceivedMessages, "Outgoing internal messages should not be empty")
			msgToSendersJettonWallet := msgToSender.OutgoingInternalReceivedMessages[0]
			require.NotEmpty(t, msgToSendersJettonWallet.OutgoingInternalReceivedMessages, "Outgoing internal messages should not be empty")
			msgToOnrampMockJettonWallet := msgToSendersJettonWallet.OutgoingInternalReceivedMessages[0]
			assert.Zero(t, msgToOnrampMockJettonWallet.ExitCode, "Onramp mock jetton wallet message should have exit code 0")
			msgWithExcessesIdx := slices.IndexFunc(msgToOnrampMockJettonWallet.OutgoingInternalReceivedMessages, func(m *tracetracking.ReceivedMessage) bool {
				return m.InternalMsg.DstAddr.Equals(setup.jettonSender.Contract.Address)
			})
			require.Greater(t, msgWithExcessesIdx, -1, "Excesses message should be present in outgoing messages")
			msgWithExcesses := msgToOnrampMockJettonWallet.OutgoingInternalReceivedMessages[msgWithExcessesIdx]
			assert.Zero(t, msgWithExcesses.ExitCode, "Excesses message should have exit code 0")

			onrampMockCallIdx := slices.IndexFunc(msgToOnrampMockJettonWallet.OutgoingInternalReceivedMessages, func(m *tracetracking.ReceivedMessage) bool {
				return m.InternalMsg.DstAddr.Equals(setup.onrampMock.Contract.Address)
			})
			require.Greater(t, onrampMockCallIdx, -1, "Onramp mock call message should be present in outgoing messages")
			onrampMockCall := msgToOnrampMockJettonWallet.OutgoingInternalReceivedMessages[onrampMockCallIdx]
			require.Zero(t, onrampMockCall.ExitCode, "Onramp mock call should have exit code 0")
			require.NotEmpty(t, onrampMockCall.OutgoingExternalMessages, "Outgoing external messages should not be empty")
			eventLog := onrampMockCall.OutgoingExternalMessages[0]
			return eventLog, nil
		}

		insufficientJettonTransferAmount := tlb.MustFromNano(big.NewInt(1), 18)
		sufficientJettonTransferAmount := tlb.MustFromNano(big.NewInt(5), 18)

		insufficientFeeEventMessage, err := sendCallWithAmount(insufficientJettonTransferAmount)
		require.NoError(t, err, "failed to send jettons with insufficient fee")
		require.NotNil(t, insufficientFeeEventMessage, "Insufficient fee event message should not be nil")
		receiverJettonWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.onrampMock.Contract.Address)
		require.NoError(t, err, "failed to get receiver wallet")
		jettonReceiverDataAfter, err := receiverJettonWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, insufficientJettonTransferAmount.Nano().Uint64(), jettonReceiverDataAfter.Uint64(), "Receiver wallet balance should match insufficient jetton transfer amount")

		acceptedRequestEventMessage, err := sendCallWithAmount(sufficientJettonTransferAmount)
		require.NoError(t, err, "failed to send jettons with sufficient fee")
		require.NotNil(t, acceptedRequestEventMessage, "Accepted request event message should not be nil")
		jettonReceiverDataAfter2, err := receiverJettonWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance after accepted request")
		expectedJettonAmount, err := insufficientJettonTransferAmount.Add(&sufficientJettonTransferAmount)
		require.NoError(t, err, "failed to calculate expected jetton amount")
		assert.Equal(t, expectedJettonAmount.Nano().Uint64(), jettonReceiverDataAfter2.Uint64(), "Receiver wallet balance should match the sum of insufficient and sufficient jetton transfer amounts")
	})

	// Test: Jetton Receiver (setup receiver when needed)
	t.Run("TestJettonReceiver", func(t *testing.T) {
		setup := setupSimpleJettonReceiver(t)

		t.Logf("\n\n\n\n\n\nJetton Receiver Tests Started\n==========================\n")

		t.Logf("Testing receiver checkers\n")
		amountChecker, err := setup.simpleReceiver.GetAmountChecker()
		require.NoError(t, err, "failed to get amount checker")
		assert.Equal(t, tlb.MustFromTON("0").Nano().Uint64(), amountChecker.Nano().Uint64(), "Amount checker should be 0.1 TON")

		payloadCheckerResult, err := setup.simpleReceiver.GetPayloadChecker()
		require.NoError(t, err, "failed to get payload checker")
		assert.Nil(t, payloadCheckerResult, "Payload checker should be nil")
		t.Logf("Receiver checkers test passed\n")

		t.Logf("Testing sending jettons to receiver\n")
		expectedPayload := createStringCell(t, "expected_payload")
		jettonAmount := tlb.MustFromTON("0.5")
		receivedMsg, err := setup.jettonSender.SendJettonsExtended(
			tlb.MustFromTON("2"),
			jettonAmount,
			setup.simpleReceiver.Contract.Address,
			cell.BeginCell().EndCell(),
			tlb.MustFromTON("0.01"),
			expectedPayload,
		)
		require.NoError(t, err, "failed to send jettons to receiver")
		JettonSenderWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.jettonSender.Contract.Address)
		require.NoError(t, err, "failed to get jetton sender wallet")
		SimpleJettonReceiverWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.simpleReceiver.Contract.Address)
		require.NoError(t, err, "failed to get simple jetton receiver wallet")
		t.Logf("Jettons sent: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String():     "Deployer",
			setup.jettonSender.Contract.Address.String():        "JettonSender",
			JettonSenderWallet.Address().String():               "JettonSenderWallet",
			setup.common.jettonMinter.Contract.Address.String(): "JettonMinter",
			setup.simpleReceiver.Contract.Address.String():      "SimpleJettonReceiver",
			SimpleJettonReceiverWallet.Address().String():       "SimpleJettonReceiverWallet",
		}, receivedMsg.Dump()))

		t.Logf("Testing receiver checkers\n")
		amountChecker, err = setup.simpleReceiver.GetAmountChecker()
		require.NoError(t, err, "failed to get amount checker")
		assert.Equal(t, jettonAmount.Nano().Uint64(), amountChecker.Nano().Uint64(), "Amount checker should be 0.1 TON")

		payloadCheckerResult, err = setup.simpleReceiver.GetPayloadChecker()
		require.NoError(t, err, "failed to get payload checker")
		assert.NotNil(t, payloadCheckerResult, "Payload checker should not be nil")
		assert.Equal(t, expectedPayload.String(), payloadCheckerResult.String(), "Payload checker should match expected payload")
		t.Logf("Receiver checkers test passed\n")

		t.Logf("All jetton receiver tests completed successfully\n")
	})

	// Test: Jetton Wallet Operations (setup wallet when needed)
	t.Run("TestJettonWalletOperations", func(t *testing.T) {
		// setup := setUpCommon(t)
		// // Deploy jetton wallet
		// t.Logf("Deploying JettonWallet contract\n")
		// jettonWallet, err := jetton_wrappers.NewJettonWalletProvider(setup.deployer).Deploy(jetton_wrappers.JettonWalletInitData{
		// 	OwnerAddress:        setup.deployer.Wallet.WalletAddress(),
		// 	JettonMasterAddress: setup.jettonMinter.Contract.Address, // use jetton minter as master
		// 	Balance:             tlb.MustFromTON("1").Nano(),
		// 	Status:              0,
		// })
		// require.NoError(t, err, "failed to deploy JettonWallet contract")
		// t.Logf("JettonWallet contract deployed at %s\n", jettonWallet.Contract.Address.String())

		// t.Logf("\n\n\n\n\n\nJetton Wallet Tests Started\n==========================\n")

		// // Test 1: Transfer jettons
		// t.Logf("Testing jetton transfer\n")
		// recipient := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ")
		// tonAmount := tlb.MustFromTON("0.1")
		// jettonAmount := tlb.MustFromTON("0.5").Nano()
		// fwdTonAmount := tlb.MustFromTON("0.01").Nano()
		// transferMsg, err := jettonWallet.SendTransfer(
		// 	tonAmount,
		// 	jettonAmount,
		// 	recipient,
		// 	setup.deployer.Wallet.WalletAddress(),
		// 	nil,
		// 	fwdTonAmount,
		// 	jetton_wrappers.NewForwardPayload(cell.BeginCell().EndCell()),
		// )
		// require.NoError(t, err, "failed to transfer jettons")
		// receiverJettonWallet, err := setup.jettonClient.GetJettonWallet(t.Context(), recipient)
		// require.NoError(t, err, "failed to get receiver wallet")
		// t.Logf("Jetton transfer message received: \n%s\n", replaceAddresses(map[string]string{
		// 	setup.deployer.Wallet.Address().String():     "Deployer",
		// 	jettonWallet.Contract.Address.String():       "JettonWallet",
		// 	setup.jettonMinter.Contract.Address.String(): "JettonMinter",
		// 	recipient.String():                           "Receiver",
		// 	receiverJettonWallet.Address().String():      "ReceiverJettonWallet",
		// }, transferMsg.Dump()))

		// jettonBalance, err := receiverJettonWallet.GetBalance(t.Context())
		// require.NoError(t, err, "failed to get receiver wallet balance")
		// assert.Equal(t, jettonAmount.Uint64(), jettonBalance.Uint64(), "Receiver wallet balance should match sent amount")
		// t.Logf("Jetton transfer test passed\n")

		// // Test 2: Burn jettons
		// t.Logf("Testing jetton burn\n")
		// jettonAmountToBurn := tlb.MustFromTON("0.1")
		// _, err = jettonWallet.SendBurn(
		// 	jettonAmountToBurn,
		// 	setup.deployer.Wallet.WalletAddress(),
		// 	nil,
		// )
		// require.NoError(t, err, "failed to burn jettons")
		// balanceAfterBurn, err := jettonWallet.GetJettonBalance()
		// require.NoError(t, err, "failed to get jetton balance after burn")
		// assert.Equal(t, jettonBalance.Uint64()-jettonAmountToBurn.Nano().Uint64(), balanceAfterBurn.Nano().Uint64(), "Jetton balance after burn should match expected")
		// t.Logf("Jetton burn test passed\n")

		// t.Logf("All jetton wallet operations tests completed successfully\n")
	})

	// Test: Jetton Minter Operations
	t.Run("TestJettonMinterOperations", func(t *testing.T) {
		// setup := setUpCommon(t)
		// t.Logf("\n\n\n\n\n\nJetton Minter Tests Started\n==========================\n")
		// // Test 1: Mint jettons
		// t.Logf("Testing jetton minting\n")
		// recipient := address.MustParseAddr("EQCKt2WPGX-fh0cIAz38Ljd_HKzh4UVNyaMqCk7jkKVOjQJz")
		// _, err := setup.jettonMinter.SendMint(
		// 	tlb.MustFromTON("0.05"),
		// 	recipient,
		// 	tlb.MustFromTON("0.05").Nano(),
		// 	tlb.MustFromTON("1").Nano(),
		// 	setup.deployer.Wallet.WalletAddress(),
		// 	setup.deployer.Wallet.WalletAddress(),
		// 	nil,
		// 	big.NewInt(0),
		// )
		// require.NoError(t, err, "failed to mint jettons")
		// t.Logf("Jetton minting test passed\n")

		// // Test 2: Change admin
		// t.Logf("Testing change admin\n")
		// newAdmin := address.MustParseAddr("EQCKt2WPGX-fh0cIAz38Ljd_HKzh4UVNyaMqCk7jkKVOjQJz")
		// _, err = setup.jettonMinter.SendChangeAdmin(newAdmin)
		// require.NoError(t, err, "failed to change admin")
		// t.Logf("Change admin test passed\n")

		// // Test 3: Change content
		// t.Logf("Testing change content\n")
		// newContent := createStringCell(t, "new_content_uri")
		// _, err = setup.jettonMinter.SendChangeContent(newContent)
		// require.NoError(t, err, "failed to change content")
		// t.Logf("Change content test passed\n")

		// // Test 4: Get jetton data
		// t.Logf("Testing get jetton data\n")
		// jettonData, err := setup.jettonMinter.GetJettonData()
		// require.NoError(t, err, "failed to get jetton data")
		// assert.GreaterOrEqual(t, jettonData.TotalSupply.Uint64(), tlb.MustFromTON("1").Nano().Uint64(), "Total supply should be at least 1 TON")
		// assert.NotNil(t, jettonData.AdminAddr, "Admin should not be nil")
		// assert.NotNil(t, jettonData.Content, "Jetton content should not be nil")
		// assert.NotNil(t, jettonData.WalletCode, "Wallet code should not be nil")
		// t.Logf("Get jetton data test passed\n")

		// t.Logf("All jetton minter operations tests completed successfully\n")
	})
}

func replaceAddresses(addressMap map[string]string, text string) string {
	for oldAddr, newAddr := range addressMap {
		text = strings.ReplaceAll(text, oldAddr, newAddr)
	}
	return text
}

func createStringCell(t *testing.T, s string) *cell.Cell {
	builder := cell.BeginCell()
	err := builder.StoreStringSnake(s)
	require.NoError(t, err, "failed to store string in cell")
	return builder.EndCell()
}
