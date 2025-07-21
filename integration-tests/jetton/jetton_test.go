package async

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

func TestJettonSendAndReceive(t *testing.T) {
	type testSetup struct {
		deployer         tracetracking.SignedAPIClient
		jettonMinter     *jetton_wrappers.JettonMinter
		jettonSender     *jetton_wrappers.JettonSender
		jettonWalletCode *cell.Cell
	}
	setUpTest := func(t *testing.T) testSetup {
		var setup testSetup
		var err error
		var initialAmount = big.NewInt(1_000_000_000_000)
		accounts := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)
		setup.deployer = accounts[0]

		fmt.Printf("\n\n\n\n\n\nJetton Test Setup\n==========================\n")

		// Create jetton content
		defaultContent := createStringCell(t, JettonDataURI)

		// Load the actual JettonWallet code
		setup.jettonWalletCode, err = loadJettonWalletCode()
		require.NoError(t, err, "failed to load JettonWallet code")

		// Deploy jetton minter
		fmt.Printf("Deploying JettonMinter contract\n")
		setup.jettonMinter, err = jetton_wrappers.NewJettonMinterProvider(setup.deployer).Deploy(jetton_wrappers.JettonMinterInitData{
			TotalSupply:   0,
			Admin:         setup.deployer.Wallet.WalletAddress(),
			TransferAdmin: nil,
			WalletCode:    setup.jettonWalletCode,
			JettonContent: defaultContent,
		})
		require.NoError(t, err, "failed to deploy JettonMinter contract")
		fmt.Printf("JettonMinter contract deployed at %s\n", setup.jettonMinter.Contract.Address.String())

		// Deploy jetton sender contract
		fmt.Printf("Deploying JettonSender contract\n")
		setup.jettonSender, err = jetton_wrappers.NewJettonSenderProvider(setup.deployer).Deploy(jetton_wrappers.JettonSenderInitData{
			MasterAddress:    setup.jettonMinter.Contract.Address,
			JettonWalletCode: setup.jettonWalletCode,
		})
		require.NoError(t, err, "failed to deploy JettonSender contract")
		fmt.Printf("JettonSender contract deployed at %s\n", setup.jettonSender.Contract.Address.String())

		// Mint jettons to sender contract
		fmt.Printf("Minting jettons to sender contract\n")
		_, err = setup.jettonMinter.SendMint(
			tlb.MustFromTON("0.05"),
			setup.jettonSender.Contract.Address,
			tlb.MustFromTON("0.05").Nano(),
			tlb.MustFromTON("1").Nano(),
			setup.deployer.Wallet.WalletAddress(),
			setup.deployer.Wallet.WalletAddress(),
			nil,
			big.NewInt(0),
		)
		require.NoError(t, err, "failed to mint jettons")
		fmt.Printf("Jettons minted successfully\n")

		return setup
	}
	t.Run("TestJettonMetadata", func(t *testing.T) {
		setup := setUpTest(t)
		totalSupply, admin, transferAdmin, jettonContent, walletCode, err := setup.jettonMinter.GetJettonData()
		require.NoError(t, err, "failed to get jetton data")
		assert.Equal(t, uint64(0), totalSupply, "Total supply should be 0 TON")
		assert.True(t, setup.deployer.Wallet.WalletAddress().Equals(admin), "Admin should be deployer")
		assert.Nil(t, transferAdmin, "Transfer admin should be nil")
		assert.NotNil(t, jettonContent, "Jetton content should not be nil")
		assert.NotNil(t, walletCode, "Wallet code should not be nil")
		assert.Equal(t, setup.jettonWalletCode.Hash(), walletCode.Hash(), "Jetton wallet code should match the deployed code")

		content, err := nft.ContentFromCell(jettonContent)
		require.NoError(t, err, "failed to load content from jetton content cell")
		switch c := content.(type) {
		case *nft.ContentOnchain:
			fmt.Printf("On-chain content URI: %s\n", c.GetAttribute("name"))
			fmt.Printf("On-chain content URI: %s\n", c.GetAttribute("description"))
			fmt.Printf("On-chain content URI: %s\n", c.GetAttribute("image"))
			t.Fatal("On-chain content is not supported in this test, expected off-chain content")
		case *nft.ContentOffchain:
			assert.Equal(t, JettonDataURI, c.URI, "Off-chain content URI should match")
		case *nft.ContentSemichain:
			assert.Equal(t, JettonDataURI, c.URI, "Semichain content URI should match")
			fmt.Printf("Semichain content URI: %s\n", c.URI)
			fmt.Printf("On-chain content name: %s\n", c.GetAttribute("name"))
			fmt.Printf("On-chain content description: %s\n", c.GetAttribute("description"))
			fmt.Printf("On-chain content image: %s\n", c.GetAttribute("image"))
		}
	})

	t.Run("TestJettonSendFast", func(t *testing.T) {
		setup := setUpTest(t)
		receiver := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ") // example address
		jettonAmount := tlb.MustFromTON("12").Nano()
		msgReceived, err := setup.jettonSender.SendJettonsFast(
			jettonAmount,
			receiver,
		)
		require.NoError(t, err, "failed to send jettons in basic mode")
		fmt.Printf("JettonSender message received: \n%s\n", replaceAddresses(map[string]string{
			setup.deployer.Wallet.Address().String():     "Deployer",
			setup.jettonSender.Contract.Address.String(): "JettonSender",
			setup.jettonMinter.Contract.Address.String(): "JettonMinter",
			receiver.String(): "Receiver",
		}, msgReceived.Dump()))

		masterClient := jetton.NewJettonMasterClient(setup.deployer.Client, setup.jettonMinter.Contract.Address)

		receiverWallet, err := masterClient.GetJettonWallet(t.Context(), receiver)
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
		fmt.Printf("Basic jetton send test passed\n")

		masterClient := jetton.NewJettonMasterClient(setup.deployer.Client, setup.jettonMinter.Contract.Address)

		receiverWallet, err := masterClient.GetJettonWallet(t.Context(), receiver)
		require.NoError(t, err, "failed to get receiver wallet")
		balance, err := receiverWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, jettonAmount.Uint64(), balance.Uint64(), "Receiver wallet balance should match sent amount")

		require.NoError(t, err, "failed to send jettons in extended mode")
		fmt.Printf("Extended jetton send test passed\n")

		fmt.Printf("All jetton send and receive tests completed successfully\n")
	})
}

// func TestJettonOnrampMock(t *testing.T) {
// 	t.Run("TestJettonOnrampMock", func(t *testing.T) {
// 		var initialAmount = big.NewInt(1_000_000_000_000)
// 		seeders := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)
// 		deployer := seeders[0]

// 		fmt.Printf("\n\n\n\n\n\nJetton Onramp Mock Test Setup\n==========================\n")

// 		// Create jetton content
// 		jettonDataURI := "smartcontract.com"
// 		defaultContent := createStringCell(jettonDataURI)

// 		// Load the actual JettonWallet code
// 		jettonWalletCode, err := loadJettonWalletCode()
// 		require.NoError(t, err, "failed to load JettonWallet code")

// 		// Deploy jetton minter
// 		fmt.Printf("Deploying JettonMinter contract\n")
// 		jettonMinter, err := jetton_wrappers.NewJettonMinterProvider(deployer).Deploy(jetton_wrappers.JettonMinterInitData{
// 			TotalSupply:   0,
// 			Admin:         deployer.Wallet.WalletAddress(),
// 			TransferAdmin: nil,
// 			WalletCode:    jettonWalletCode,
// 			JettonContent: defaultContent,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonMinter contract")
// 		fmt.Printf("JettonMinter contract deployed at %s\n", jettonMinter.Contract.Address.String())

// 		// Deploy jetton sender contract
// 		fmt.Printf("Deploying JettonSender contract\n")
// 		jettonSender, err := jetton_wrappers.NewJettonSenderProvider(deployer).Deploy(jetton_wrappers.JettonSenderInitData{
// 			MasterAddress:    jettonMinter.Contract.Address,
// 			JettonWalletCode: jettonWalletCode,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonSender contract")
// 		fmt.Printf("JettonSender contract deployed at %s\n", jettonSender.Contract.Address.String())

// 		// Deploy onramp mock contract
// 		fmt.Printf("Deploying OnrampMock contract\n")
// 		onrampMock, err := jetton_wrappers.NewOnrampMockProvider(deployer).Deploy(jetton_wrappers.OnrampMockInitData{
// 			MasterAddress:    jettonMinter.Contract.Address,
// 			JettonWalletCode: jettonWalletCode,
// 		})
// 		require.NoError(t, err, "failed to deploy OnrampMock contract")
// 		fmt.Printf("OnrampMock contract deployed at %s\n", onrampMock.Contract.Address.String())

// 		// Mint jettons to sender contract
// 		fmt.Printf("Minting jettons to sender contract\n")
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
// 		fmt.Printf("Jettons minted successfully\n")

// 		fmt.Printf("\n\n\n\n\n\nOnramp Mock Tests Started\n==========================\n")

// 		// Test: Send jettons to onramp mock and verify notification
// 		fmt.Printf("Testing onramp mock notification\n")
// 		forwardPayload := createStringCell("onramp_request")
// 		_, err = jettonSender.SendJettonsExtended(
// 			tlb.MustFromTON("0.1").NanoTON().Uint64(),
// 			onrampMock.Contract.Address,
// 			nil,
// 			tlb.MustFromTON("0.01").NanoTON().Uint64(),
// 			forwardPayload,
// 		)
// 		require.NoError(t, err, "failed to send jettons to onramp mock")
// 		fmt.Printf("Onramp mock notification test passed\n")

// 		fmt.Printf("All onramp mock tests completed successfully\n")
// 	})
// }

// func TestJettonReceiver(t *testing.T) {
// 	t.Run("TestJettonReceiver", func(t *testing.T) {
// 		var initialAmount = big.NewInt(1_000_000_000_000)
// 		seeders := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)
// 		deployer := seeders[0]

// 		fmt.Printf("\n\n\n\n\n\nJetton Receiver Test Setup\n==========================\n")

// 		// Create jetton content
// 		jettonDataURI := "smartcontract.com"
// 		defaultContent := createStringCell(jettonDataURI)

// 		// Load the actual JettonWallet code
// 		jettonWalletCode, err := loadJettonWalletCode()
// 		require.NoError(t, err, "failed to load JettonWallet code")

// 		// Deploy jetton minter
// 		fmt.Printf("Deploying JettonMinter contract\n")
// 		jettonMinter, err := jetton_wrappers.NewJettonMinterProvider(deployer).Deploy(jetton_wrappers.JettonMinterInitData{
// 			TotalSupply:   0,
// 			Admin:         deployer.Wallet.WalletAddress(),
// 			TransferAdmin: nil,
// 			WalletCode:    jettonWalletCode,
// 			JettonContent: defaultContent,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonMinter contract")
// 		fmt.Printf("JettonMinter contract deployed at %s\n", jettonMinter.Contract.Address.String())

// 		// Deploy jetton sender contract
// 		fmt.Printf("Deploying JettonSender contract\n")
// 		jettonSender, err := jetton_wrappers.NewJettonSenderProvider(deployer).Deploy(jetton_wrappers.JettonSenderInitData{
// 			MasterAddress:    jettonMinter.Contract.Address,
// 			JettonWalletCode: jettonWalletCode,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonSender contract")
// 		fmt.Printf("JettonSender contract deployed at %s\n", jettonSender.Contract.Address.String())

// 		// Deploy simple jetton receiver contract
// 		fmt.Printf("Deploying SimpleJettonReceiver contract\n")
// 		payloadChecker := createStringCell("expected_payload")
// 		simpleJettonReceiver, err := jetton_wrappers.NewSimpleJettonReceiverProvider(deployer).Deploy(jetton_wrappers.SimpleJettonReceiverInitData{
// 			MasterAddress:    jettonMinter.Contract.Address,
// 			JettonWalletCode: jettonWalletCode,
// 			AmountChecker:    tlb.MustFromTON("0.1").NanoTON().Uint64(),
// 			PayloadChecker:   payloadChecker,
// 		})
// 		require.NoError(t, err, "failed to deploy SimpleJettonReceiver contract")
// 		fmt.Printf("SimpleJettonReceiver contract deployed at %s\n", simpleJettonReceiver.Contract.Address.String())

// 		// Mint jettons to sender contract
// 		fmt.Printf("Minting jettons to sender contract\n")
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
// 		fmt.Printf("Jettons minted successfully\n")

// 		fmt.Printf("\n\n\n\n\n\nJetton Receiver Tests Started\n==========================\n")

// 		// Test 1: Get receiver checkers
// 		fmt.Printf("Testing receiver checkers\n")
// 		amountChecker, err := simpleJettonReceiver.GetAmountChecker()
// 		require.NoError(t, err, "failed to get amount checker")
// 		assert.Equal(t, tlb.MustFromTON("0.1").NanoTON().Uint64(), amountChecker, "Amount checker should be 0.1 TON")

// 		payloadCheckerResult, err := simpleJettonReceiver.GetPayloadChecker()
// 		require.NoError(t, err, "failed to get payload checker")
// 		assert.NotNil(t, payloadCheckerResult, "Payload checker should not be nil")
// 		fmt.Printf("Receiver checkers test passed\n")

// 		// Test 2: Get simple receiver checkers (duplicate test removed)
// 		fmt.Printf("Testing simple receiver checkers\n")
// 		simpleAmountChecker, err := simpleJettonReceiver.GetAmountChecker()
// 		require.NoError(t, err, "failed to get simple amount checker")
// 		assert.Equal(t, tlb.MustFromTON("0.1").NanoTON().Uint64(), simpleAmountChecker, "Simple amount checker should be 0.1 TON")

// 		simplePayloadCheckerResult, err := simpleJettonReceiver.GetPayloadChecker()
// 		require.NoError(t, err, "failed to get simple payload checker")
// 		assert.NotNil(t, simplePayloadCheckerResult, "Simple payload checker should not be nil")
// 		fmt.Printf("Simple receiver checkers test passed\n")

// 		// Test 3: Send jettons to receiver
// 		fmt.Printf("Testing sending jettons to receiver\n")
// 		expectedPayload := createStringCell("expected_payload")
// 		_, err = jettonSender.SendJettonsExtended(
// 			tlb.MustFromTON("0.1").NanoTON().Uint64(),
// 			simpleJettonReceiver.Contract.Address,
// 			nil,
// 			tlb.MustFromTON("0.01").NanoTON().Uint64(),
// 			expectedPayload,
// 		)
// 		require.NoError(t, err, "failed to send jettons to receiver")
// 		fmt.Printf("Sending jettons to receiver test passed\n")

// 		// Test 4: Send jettons to simple receiver
// 		fmt.Printf("Testing sending jettons to simple receiver\n")
// 		_, err = jettonSender.SendJettonsExtended(
// 			tlb.MustFromTON("0.05").NanoTON().Uint64(),
// 			simpleJettonReceiver.Contract.Address,
// 			nil,
// 			tlb.MustFromTON("0.01").NanoTON().Uint64(),
// 			expectedPayload,
// 		)
// 		require.NoError(t, err, "failed to send jettons to simple receiver")
// 		fmt.Printf("Sending jettons to simple receiver test passed\n")

// 		fmt.Printf("All jetton receiver tests completed successfully\n")
// 	})
// }

// func TestJettonWalletOperations(t *testing.T) {
// 	t.Run("TestJettonWalletOperations", func(t *testing.T) {
// 		var initialAmount = big.NewInt(1_000_000_000_000)
// 		seeders := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)
// 		deployer := seeders[0]

// 		fmt.Printf("\n\n\n\n\n\nJetton Wallet Operations Test Setup\n==========================\n")

// 		// Deploy jetton wallet
// 		fmt.Printf("Deploying JettonWallet contract\n")
// 		jettonWallet, err := jetton_wrappers.NewJettonWalletProvider(deployer).Deploy(jetton_wrappers.JettonWalletInitData{
// 			OwnerAddress:        deployer.Wallet.WalletAddress(),
// 			JettonMasterAddress: deployer.Wallet.WalletAddress(), // use deployer as master for testing
// 			Balance:             tlb.MustFromTON("1").NanoTON().Uint64(),
// 			Status:              0,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonWallet contract")
// 		fmt.Printf("JettonWallet contract deployed at %s\n", jettonWallet.Contract.Address.String())

// 		fmt.Printf("\n\n\n\n\n\nJetton Wallet Tests Started\n==========================\n")

// 		// Test 1: Transfer jettons
// 		fmt.Printf("Testing jetton transfer\n")
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
// 		fmt.Printf("Jetton transfer test passed\n")

// 		// Test 2: Burn jettons
// 		fmt.Printf("Testing jetton burn\n")
// 		_, err = jettonWallet.SendBurn(
// 			tlb.MustFromTON("0.1").NanoTON().Uint64(),
// 			deployer.Wallet.WalletAddress(),
// 			nil,
// 		)
// 		require.NoError(t, err, "failed to burn jettons")
// 		fmt.Printf("Jetton burn test passed\n")

// 		// Test 3: Withdraw TONs
// 		fmt.Printf("Testing withdraw TONs\n")
// 		_, err = jettonWallet.SendWithdrawTons()
// 		require.NoError(t, err, "failed to withdraw TONs")
// 		fmt.Printf("Withdraw TONs test passed\n")

// 		// Test 4: Withdraw jettons
// 		fmt.Printf("Testing withdraw jettons\n")
// 		_, err = jettonWallet.SendWithdrawJettons(
// 			deployer.Wallet.WalletAddress(),
// 			tlb.MustFromTON("0.1").NanoTON().Uint64(),
// 		)
// 		require.NoError(t, err, "failed to withdraw jettons")
// 		fmt.Printf("Withdraw jettons test passed\n")

// 		fmt.Printf("All jetton wallet operations tests completed successfully\n")
// 	})
// }

// func TestJettonMinterOperations(t *testing.T) {
// 	t.Run("TestJettonMinterOperations", func(t *testing.T) {
// 		var initialAmount = big.NewInt(1_000_000_000_000)
// 		seeders := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)
// 		deployer := seeders[0]

// 		fmt.Printf("\n\n\n\n\n\nJetton Minter Operations Test Setup\n==========================\n")

// 		// Create jetton content
// 		jettonDataURI := "smartcontract.com"
// 		defaultContent := createStringCell(jettonDataURI)

// 		// Load the actual JettonWallet code
// 		jettonWalletCode, err := loadJettonWalletCode()
// 		require.NoError(t, err, "failed to load JettonWallet code")

// 		// Deploy jetton minter
// 		fmt.Printf("Deploying JettonMinter contract\n")
// 		jettonMinter, err := jetton_wrappers.NewJettonMinterProvider(deployer).Deploy(jetton_wrappers.JettonMinterInitData{
// 			TotalSupply:   0,
// 			Admin:         deployer.Wallet.WalletAddress(),
// 			TransferAdmin: nil,
// 			WalletCode:    jettonWalletCode,
// 			JettonContent: defaultContent,
// 		})
// 		require.NoError(t, err, "failed to deploy JettonMinter contract")
// 		fmt.Printf("JettonMinter contract deployed at %s\n", jettonMinter.Contract.Address.String())

// 		fmt.Printf("\n\n\n\n\n\nJetton Minter Tests Started\n==========================\n")

// 		// Test 1: Mint jettons
// 		fmt.Printf("Testing jetton minting\n")
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
// 		fmt.Printf("Jetton minting test passed\n")

// 		// Test 2: Change admin
// 		fmt.Printf("Testing change admin\n")
// 		newAdmin := address.MustParseAddr("EQCKt2WPGX-fh0cIAz38Ljd_HKzh4UVNyaMqCk7jkKVOjQJz")
// 		_, err = jettonMinter.SendChangeAdmin(newAdmin)
// 		require.NoError(t, err, "failed to change admin")
// 		fmt.Printf("Change admin test passed\n")

// 		// Test 3: Change content
// 		fmt.Printf("Testing change content\n")
// 		newContent := createStringCell("new_content_uri")
// 		_, err = jettonMinter.SendChangeContent(newContent)
// 		require.NoError(t, err, "failed to change content")
// 		fmt.Printf("Change content test passed\n")

// 		// Test 4: Get jetton data
// 		fmt.Printf("Testing get jetton data\n")
// 		totalSupply, admin, transferAdmin, jettonContent, walletCode, err := jettonMinter.GetJettonData()
// 		require.NoError(t, err, "failed to get jetton data")
// 		assert.Equal(t, tlb.MustFromTON("1").NanoTON().Uint64(), totalSupply, "Total supply should be 1 TON")
// 		assert.NotNil(t, admin, "Admin should not be nil")
// 		assert.Nil(t, transferAdmin, "Transfer admin should be nil")
// 		assert.NotNil(t, jettonContent, "Jetton content should not be nil")
// 		assert.NotNil(t, walletCode, "Wallet code should not be nil")
// 		fmt.Printf("Get jetton data test passed\n")

// 		fmt.Printf("All jetton minter operations tests completed successfully\n")
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
