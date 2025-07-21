package jetton

import (
	"fmt"
	"math/big"
	"os"
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

var jettonMintingAmount *big.Int = tlb.MustFromTON("100").Nano()

func TestJettonSendAndReceive(t *testing.T) {
	type testSetup struct {
		deployer         tracetracking.SignedAPIClient
		jettonMinter     *jetton_wrappers.JettonMinter
		jettonSender     *jetton_wrappers.JettonSender
		jettonWalletCode *cell.Cell
		jettonClient     *jetton.Client
	}
	setUpTest := func(t *testing.T) testSetup {
		var setup testSetup
		var err error
		var initialAmount = big.NewInt(1_000_000_000_000)
		accounts := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)
		setup.deployer = accounts[0]

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

		// Deploy jetton sender contract
		t.Logf("Deploying JettonSender contract\n")
		setup.jettonSender, err = jetton_wrappers.NewJettonSenderProvider(setup.deployer).Deploy(jetton_wrappers.JettonSenderInitData{
			MasterAddress:    setup.jettonMinter.Contract.Address,
			JettonWalletCode: setup.jettonWalletCode,
		})
		require.NoError(t, err, "failed to deploy JettonSender contract")
		t.Logf("JettonSender contract deployed at %s\n", setup.jettonSender.Contract.Address.String())

		// Mint jettons to sender contract
		t.Logf("Minting jettons to sender contract\n")
		sendMintMsg, err := setup.jettonMinter.SendMint(
			tlb.MustFromTON("0.05"),
			setup.jettonSender.Contract.Address,
			tlb.MustFromTON("0.05").Nano(),
			jettonMintingAmount,
			setup.deployer.Wallet.WalletAddress(),
			setup.deployer.Wallet.WalletAddress(),
			nil,
			big.NewInt(0),
		)
		require.NoError(t, err, "failed to mint jettons")
		t.Logf("Msg trace:\n%s\n", sendMintMsg.Dump())

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

		setup.jettonClient = jetton.NewJettonMasterClient(setup.deployer.Client, setup.jettonMinter.Contract.Address)

		senderJettonWallet, err := setup.jettonClient.GetJettonWallet(t.Context(), setup.jettonSender.Contract.Address)
		require.NoError(t, err, "failed to get receiver wallet")
		require.Equal(t, senderJettonWalletAddress, senderJettonWallet.Address(), "Jetton Wallet Address calculated by master contract should match the cretaed one.")

		balance, err := senderJettonWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		require.Equal(t, jettonMintingAmount.Uint64(), balance.Uint64(), "Receiver wallet balance should match sent amount")

		t.Logf("Jettons minted successfully\n")

		return setup
	}
	t.Run("TestJettonMetadata", func(t *testing.T) {
		setup := setUpTest(t)
		jettonData, err := setup.jettonMinter.GetJettonData()
		require.NoError(t, err, "failed to get jetton data")
		assert.Equal(t, jettonMintingAmount, jettonData.TotalSupply, "Total supply should be 0 TON")
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

	t.Run("TestJettonSendFast", func(t *testing.T) {
		setup := setUpTest(t)
		t.Log("parsing receiver address")
		receiver := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ") // example address
		t.Log("receiver address parsed successfully")
		jettonAmount := tlb.MustFromTON("12").Nano()
		t.Log("Sending jettons in basic mode")
		msgReceived, err := setup.jettonSender.SendJettonsFast(
			jettonAmount,
			receiver,
		)
		require.NoError(t, err, "failed to send jettons in basic mode")
		t.Log("Jettons sent successfully")
		t.Logf("JettonSender message received: \n%s\n", replaceAddresses(map[string]string{
			setup.deployer.Wallet.Address().String():     "Deployer",
			setup.jettonSender.Contract.Address.String(): "JettonSender",
			setup.jettonMinter.Contract.Address.String(): "JettonMinter",
			receiver.String(): "Receiver",
		}, msgReceived.Dump()))

		receiverWallet, err := setup.jettonClient.GetJettonWallet(t.Context(), receiver)
		require.NoError(t, err, "failed to get receiver wallet")
		balance, err := receiverWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, jettonAmount.Uint64(), balance.Uint64(), "Receiver wallet balance should match sent amount")
	})

	t.Run("TestJettonSendExtended", func(t *testing.T) {
		setup := setUpTest(t)
		receiver := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ") // example address
		tonAmount := tlb.MustFromTON("0.1")
		jettonAmount := tlb.MustFromTON("12").Nano()
		forwardTonAmount := tlb.MustFromTON("0.01").Nano()

		customPayload := createStringCell(t, "custom_payload")
		forwardPayload := createStringCell(t, "forward_payload")

		_, err := setup.jettonSender.SendJettonsExtended(
			tonAmount,
			jettonAmount,
			receiver,
			customPayload,
			forwardTonAmount,
			forwardPayload,
		)
		require.NoError(t, err, "failed to send jettons in basic mode")
		t.Logf("Basic jetton send test passed\n")

		receiverWallet, err := setup.jettonClient.GetJettonWallet(t.Context(), receiver)
		require.NoError(t, err, "failed to get receiver wallet")
		balance, err := receiverWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, jettonAmount.Uint64(), balance.Uint64(), "Receiver wallet balance should match sent amount")

		require.NoError(t, err, "failed to send jettons in extended mode")
		t.Logf("Extended jetton send test passed\n")

		t.Logf("All jetton send and receive tests completed successfully\n")
	})
}

// func TestJettonOnrampMock(t *testing.T) {
// 	t.Run("TestJettonOnrampMock", func(t *testing.T) {
// 		var initialAmount = big.NewInt(1_000_000_000_000)
// 		seeders := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)
// 		deployer := seeders[0]

// 		t.Logf("\n\n\n\n\n\nJetton Onramp Mock Test Setup\n==========================\n")

// 		// Create jetton content
// 		jettonDataURI := "smartcontract.com"
// 		defaultContent := createStringCell(jettonDataURI)

// 		// Load the actual JettonWallet code
// 		jettonWalletCode, err := loadJettonWalletCode()
// 		require.NoError(t, err, "failed to load JettonWallet code")

// 		// Deploy jetton minter
// 		t.Logf("Deploying JettonMinter contract\n")
// 		jettonMinter, err := jetton_wrappers.NewJettonMinterProvider(deployer).Deploy(jetton_wrappers.JettonMinterInitData{
// 			TotalSupply:   0,
// 			Admin:         deployer.Wallet.WalletAddress(),
// 			TransferAdmin: nil,
// 			WalletCode:    jettonWalletCode,
// 			JettonContent: defaultContent,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonMinter contract")
// 		t.Logf("JettonMinter contract deployed at %s\n", jettonMinter.Contract.Address.String())

// 		// Deploy jetton sender contract
// 		t.Logf("Deploying JettonSender contract\n")
// 		jettonSender, err := jetton_wrappers.NewJettonSenderProvider(deployer).Deploy(jetton_wrappers.JettonSenderInitData{
// 			MasterAddress:    jettonMinter.Contract.Address,
// 			JettonWalletCode: jettonWalletCode,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonSender contract")
// 		t.Logf("JettonSender contract deployed at %s\n", jettonSender.Contract.Address.String())

// 		// Deploy onramp mock contract
// 		t.Logf("Deploying OnrampMock contract\n")
// 		onrampMock, err := jetton_wrappers.NewOnrampMockProvider(deployer).Deploy(jetton_wrappers.OnrampMockInitData{
// 			MasterAddress:    jettonMinter.Contract.Address,
// 			JettonWalletCode: jettonWalletCode,
// 		})
// 		require.NoError(t, err, "failed to deploy OnrampMock contract")
// 		t.Logf("OnrampMock contract deployed at %s\n", onrampMock.Contract.Address.String())

// 		// Mint jettons to sender contract
// 		t.Logf("Minting jettons to sender contract\n")
// 		_, err = jettonMinter.SendMint(
// 			jettonSender.Contract.Address,
// 			tlb.MustFromTON("0.05").NanoTON().Uint64(),
// 			tlb.MustFromTON("1").NanoTON().Uint64(),
// 			deployer.Wallet.WalletAddress(),
// 			deployer.Wallet.WalletAddress(),
// 			nil,
// 			0,
// 		)
// 		require.NoError(t, err, "failed to mint jettons")
// 		t.Logf("Jettons minted successfully\n")

// 		t.Logf("\n\n\n\n\n\nOnramp Mock Tests Started\n==========================\n")

// 		// Test: Send jettons to onramp mock and verify notification
// 		t.Logf("Testing onramp mock notification\n")
// 		forwardPayload := createStringCell("onramp_request")
// 		_, err = jettonSender.SendJettonsExtended(
// 			tlb.MustFromTON("0.1").NanoTON().Uint64(),
// 			onrampMock.Contract.Address,
// 			nil,
// 			tlb.MustFromTON("0.01").NanoTON().Uint64(),
// 			forwardPayload,
// 		)
// 		require.NoError(t, err, "failed to send jettons to onramp mock")
// 		t.Logf("Onramp mock notification test passed\n")

// 		t.Logf("All onramp mock tests completed successfully\n")
// 	})
// }

// func TestJettonReceiver(t *testing.T) {
// 	t.Run("TestJettonReceiver", func(t *testing.T) {
// 		var initialAmount = big.NewInt(1_000_000_000_000)
// 		seeders := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)
// 		deployer := seeders[0]

// 		t.Logf("\n\n\n\n\n\nJetton Receiver Test Setup\n==========================\n")

// 		// Create jetton content
// 		jettonDataURI := "smartcontract.com"
// 		defaultContent := createStringCell(jettonDataURI)

// 		// Load the actual JettonWallet code
// 		jettonWalletCode, err := loadJettonWalletCode()
// 		require.NoError(t, err, "failed to load JettonWallet code")

// 		// Deploy jetton minter
// 		t.Logf("Deploying JettonMinter contract\n")
// 		jettonMinter, err := jetton_wrappers.NewJettonMinterProvider(deployer).Deploy(jetton_wrappers.JettonMinterInitData{
// 			TotalSupply:   0,
// 			Admin:         deployer.Wallet.WalletAddress(),
// 			TransferAdmin: nil,
// 			WalletCode:    jettonWalletCode,
// 			JettonContent: defaultContent,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonMinter contract")
// 		t.Logf("JettonMinter contract deployed at %s\n", jettonMinter.Contract.Address.String())

// 		// Deploy jetton sender contract
// 		t.Logf("Deploying JettonSender contract\n")
// 		jettonSender, err := jetton_wrappers.NewJettonSenderProvider(deployer).Deploy(jetton_wrappers.JettonSenderInitData{
// 			MasterAddress:    jettonMinter.Contract.Address,
// 			JettonWalletCode: jettonWalletCode,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonSender contract")
// 		t.Logf("JettonSender contract deployed at %s\n", jettonSender.Contract.Address.String())

// 		// Deploy simple jetton receiver contract
// 		t.Logf("Deploying SimpleJettonReceiver contract\n")
// 		payloadChecker := createStringCell("expected_payload")
// 		simpleJettonReceiver, err := jetton_wrappers.NewSimpleJettonReceiverProvider(deployer).Deploy(jetton_wrappers.SimpleJettonReceiverInitData{
// 			MasterAddress:    jettonMinter.Contract.Address,
// 			JettonWalletCode: jettonWalletCode,
// 			AmountChecker:    tlb.MustFromTON("0.1").NanoTON().Uint64(),
// 			PayloadChecker:   payloadChecker,
// 		})
// 		require.NoError(t, err, "failed to deploy SimpleJettonReceiver contract")
// 		t.Logf("SimpleJettonReceiver contract deployed at %s\n", simpleJettonReceiver.Contract.Address.String())

// 		// Mint jettons to sender contract
// 		t.Logf("Minting jettons to sender contract\n")
// 		_, err = jettonMinter.SendMint(
// 			jettonSender.Contract.Address,
// 			tlb.MustFromTON("0.05").NanoTON().Uint64(),
// 			tlb.MustFromTON("1").NanoTON().Uint64(),
// 			deployer.Wallet.WalletAddress(),
// 			deployer.Wallet.WalletAddress(),
// 			nil,
// 			0,
// 		)
// 		require.NoError(t, err, "failed to mint jettons")
// 		t.Logf("Jettons minted successfully\n")

// 		t.Logf("\n\n\n\n\n\nJetton Receiver Tests Started\n==========================\n")

// 		// Test 1: Get receiver checkers
// 		t.Logf("Testing receiver checkers\n")
// 		amountChecker, err := simpleJettonReceiver.GetAmountChecker()
// 		require.NoError(t, err, "failed to get amount checker")
// 		assert.Equal(t, tlb.MustFromTON("0.1").NanoTON().Uint64(), amountChecker, "Amount checker should be 0.1 TON")

// 		payloadCheckerResult, err := simpleJettonReceiver.GetPayloadChecker()
// 		require.NoError(t, err, "failed to get payload checker")
// 		assert.NotNil(t, payloadCheckerResult, "Payload checker should not be nil")
// 		t.Logf("Receiver checkers test passed\n")

// 		// Test 2: Get simple receiver checkers (duplicate test removed)
// 		t.Logf("Testing simple receiver checkers\n")
// 		simpleAmountChecker, err := simpleJettonReceiver.GetAmountChecker()
// 		require.NoError(t, err, "failed to get simple amount checker")
// 		assert.Equal(t, tlb.MustFromTON("0.1").NanoTON().Uint64(), simpleAmountChecker, "Simple amount checker should be 0.1 TON")

// 		simplePayloadCheckerResult, err := simpleJettonReceiver.GetPayloadChecker()
// 		require.NoError(t, err, "failed to get simple payload checker")
// 		assert.NotNil(t, simplePayloadCheckerResult, "Simple payload checker should not be nil")
// 		t.Logf("Simple receiver checkers test passed\n")

// 		// Test 3: Send jettons to receiver
// 		t.Logf("Testing sending jettons to receiver\n")
// 		expectedPayload := createStringCell("expected_payload")
// 		_, err = jettonSender.SendJettonsExtended(
// 			tlb.MustFromTON("0.1").NanoTON().Uint64(),
// 			simpleJettonReceiver.Contract.Address,
// 			nil,
// 			tlb.MustFromTON("0.01").NanoTON().Uint64(),
// 			expectedPayload,
// 		)
// 		require.NoError(t, err, "failed to send jettons to receiver")
// 		t.Logf("Sending jettons to receiver test passed\n")

// 		// Test 4: Send jettons to simple receiver
// 		t.Logf("Testing sending jettons to simple receiver\n")
// 		_, err = jettonSender.SendJettonsExtended(
// 			tlb.MustFromTON("0.05").NanoTON().Uint64(),
// 			simpleJettonReceiver.Contract.Address,
// 			nil,
// 			tlb.MustFromTON("0.01").NanoTON().Uint64(),
// 			expectedPayload,
// 		)
// 		require.NoError(t, err, "failed to send jettons to simple receiver")
// 		t.Logf("Sending jettons to simple receiver test passed\n")

// 		t.Logf("All jetton receiver tests completed successfully\n")
// 	})
// }

// func TestJettonWalletOperations(t *testing.T) {
// 	t.Run("TestJettonWalletOperations", func(t *testing.T) {
// 		var initialAmount = big.NewInt(1_000_000_000_000)
// 		seeders := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)
// 		deployer := seeders[0]

// 		t.Logf("\n\n\n\n\n\nJetton Wallet Operations Test Setup\n==========================\n")

// 		// Deploy jetton wallet
// 		t.Logf("Deploying JettonWallet contract\n")
// 		jettonWallet, err := jetton_wrappers.NewJettonWalletProvider(deployer).Deploy(jetton_wrappers.JettonWalletInitData{
// 			OwnerAddress:        deployer.Wallet.WalletAddress(),
// 			JettonMasterAddress: deployer.Wallet.WalletAddress(), // use deployer as master for testing
// 			Balance:             tlb.MustFromTON("1").NanoTON().Uint64(),
// 			Status:              0,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonWallet contract")
// 		t.Logf("JettonWallet contract deployed at %s\n", jettonWallet.Contract.Address.String())

// 		t.Logf("\n\n\n\n\n\nJetton Wallet Tests Started\n==========================\n")

// 		// Test 1: Transfer jettons
// 		t.Logf("Testing jetton transfer\n")
// 		recipient := address.MustParseAddr("EQCKt2WPGX-fh0cIAz38Ljd_HKzh4UVNyaMqCk7jkKVOjQJz")
// 		_, err = jettonWallet.SendTransfer(
// 			tlb.MustFromTON("0.5").NanoTON().Uint64(),
// 			recipient,
// 			deployer.Wallet.WalletAddress(),
// 			nil,
// 			tlb.MustFromTON("0.01").NanoTON().Uint64(),
// 			nil,
// 		)
// 		require.NoError(t, err, "failed to transfer jettons")
// 		t.Logf("Jetton transfer test passed\n")

// 		// Test 2: Burn jettons
// 		t.Logf("Testing jetton burn\n")
// 		_, err = jettonWallet.SendBurn(
// 			tlb.MustFromTON("0.1").NanoTON().Uint64(),
// 			deployer.Wallet.WalletAddress(),
// 			nil,
// 		)
// 		require.NoError(t, err, "failed to burn jettons")
// 		t.Logf("Jetton burn test passed\n")

// 		// Test 3: Withdraw TONs
// 		t.Logf("Testing withdraw TONs\n")
// 		_, err = jettonWallet.SendWithdrawTons()
// 		require.NoError(t, err, "failed to withdraw TONs")
// 		t.Logf("Withdraw TONs test passed\n")

// 		// Test 4: Withdraw jettons
// 		t.Logf("Testing withdraw jettons\n")
// 		_, err = jettonWallet.SendWithdrawJettons(
// 			deployer.Wallet.WalletAddress(),
// 			tlb.MustFromTON("0.1").NanoTON().Uint64(),
// 		)
// 		require.NoError(t, err, "failed to withdraw jettons")
// 		t.Logf("Withdraw jettons test passed\n")

// 		t.Logf("All jetton wallet operations tests completed successfully\n")
// 	})
// }

// func TestJettonMinterOperations(t *testing.T) {
// 	t.Run("TestJettonMinterOperations", func(t *testing.T) {
// 		var initialAmount = big.NewInt(1_000_000_000_000)
// 		seeders := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)
// 		deployer := seeders[0]

// 		t.Logf("\n\n\n\n\n\nJetton Minter Operations Test Setup\n==========================\n")

// 		// Create jetton content
// 		jettonDataURI := "smartcontract.com"
// 		defaultContent := createStringCell(jettonDataURI)

// 		// Load the actual JettonWallet code
// 		jettonWalletCode, err := loadJettonWalletCode()
// 		require.NoError(t, err, "failed to load JettonWallet code")

// 		// Deploy jetton minter
// 		t.Logf("Deploying JettonMinter contract\n")
// 		jettonMinter, err := jetton_wrappers.NewJettonMinterProvider(deployer).Deploy(jetton_wrappers.JettonMinterInitData{
// 			TotalSupply:   0,
// 			Admin:         deployer.Wallet.WalletAddress(),
// 			TransferAdmin: nil,
// 			WalletCode:    jettonWalletCode,
// 			JettonContent: defaultContent,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonMinter contract")
// 		t.Logf("JettonMinter contract deployed at %s\n", jettonMinter.Contract.Address.String())

// 		t.Logf("\n\n\n\n\n\nJetton Minter Tests Started\n==========================\n")

// 		// Test 1: Mint jettons
// 		t.Logf("Testing jetton minting\n")
// 		recipient := address.MustParseAddr("EQCKt2WPGX-fh0cIAz38Ljd_HKzh4UVNyaMqCk7jkKVOjQJz")
// 		_, err = jettonMinter.SendMint(
// 			recipient,
// 			tlb.MustFromTON("0.05").NanoTON().Uint64(),
// 			tlb.MustFromTON("1").NanoTON().Uint64(),
// 			deployer.Wallet.WalletAddress(),
// 			deployer.Wallet.WalletAddress(),
// 			nil,
// 			0,
// 		)
// 		require.NoError(t, err, "failed to mint jettons")
// 		t.Logf("Jetton minting test passed\n")

// 		// Test 2: Change admin
// 		t.Logf("Testing change admin\n")
// 		newAdmin := address.MustParseAddr("EQCKt2WPGX-fh0cIAz38Ljd_HKzh4UVNyaMqCk7jkKVOjQJz")
// 		_, err = jettonMinter.SendChangeAdmin(newAdmin)
// 		require.NoError(t, err, "failed to change admin")
// 		t.Logf("Change admin test passed\n")

// 		// Test 3: Change content
// 		t.Logf("Testing change content\n")
// 		newContent := createStringCell("new_content_uri")
// 		_, err = jettonMinter.SendChangeContent(newContent)
// 		require.NoError(t, err, "failed to change content")
// 		t.Logf("Change content test passed\n")

// 		// Test 4: Get jetton data
// 		t.Logf("Testing get jetton data\n")
// 		totalSupply, admin, transferAdmin, jettonContent, walletCode, err := jettonMinter.GetJettonData()
// 		require.NoError(t, err, "failed to get jetton data")
// 		assert.Equal(t, tlb.MustFromTON("1").NanoTON().Uint64(), totalSupply, "Total supply should be 1 TON")
// 		assert.NotNil(t, admin, "Admin should not be nil")
// 		assert.Nil(t, transferAdmin, "Transfer admin should be nil")
// 		assert.NotNil(t, jettonContent, "Jetton content should not be nil")
// 		assert.NotNil(t, walletCode, "Wallet code should not be nil")
// 		t.Logf("Get jetton data test passed\n")

// 		t.Logf("All jetton minter operations tests completed successfully\n")
// 	})
// }

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
