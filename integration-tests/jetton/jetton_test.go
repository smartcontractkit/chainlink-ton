package jetton

import (
	"fmt"
	"math/big"
	"math/rand/v2"
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

// Helper function to load the actual JettonWallet code
func loadJettonWalletCode() (*cell.Cell, error) {
	jettonWalletPath := path.Join(jetton_wrappers.PathContractsJetton, "JettonWallet.compiled.json")
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
		jettonMinter     *wrappers.Contract
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

		defaultContent := createStringCell(t, JettonDataURI)

		setup.jettonWalletCode, err = loadJettonWalletCode()
		require.NoError(t, err, "failed to load JettonWallet code")

		t.Logf("Deploying JettonMinter contract\n")
		setup.jettonMinter = DeployMinter(t, &setup.deployer, jetton_wrappers.JettonMinterInitData{
			TotalSupply:   tlb.ZeroCoins,
			Admin:         setup.deployer.Wallet.WalletAddress(),
			TransferAdmin: nil,
			WalletCode:    setup.jettonWalletCode,
			JettonContent: defaultContent,
		})
		t.Logf("JettonMinter contract deployed at %s\n", setup.jettonMinter.Address.String())

		setup.jettonClient = jetton.NewJettonMasterClient(setup.deployer.Client, setup.jettonMinter.Address)

		return setup
	}

	type senderSetup struct {
		common commonSetup
		sender *jetton_wrappers.JettonSender
	}

	setupJettonSender := func(t *testing.T) *senderSetup {
		setup := setUpCommon(t)

		t.Logf("Deploying JettonSender contract\n")
		jettonSender, err := jetton_wrappers.NewJettonSenderProvider(setup.deployer).Deploy(jetton_wrappers.JettonSenderInitData{
			MasterAddress:    setup.jettonMinter.Address,
			JettonWalletCode: setup.jettonWalletCode,
		})
		require.NoError(t, err, "failed to deploy JettonSender contract")
		t.Logf("JettonSender contract deployed at %s\n", jettonSender.Contract.Address.String())

		t.Logf("Minting jettons to sender contract\n")
		queryID := rand.Uint64()
		sendMintMsg, err := setup.jettonMinter.CallWaitRecursively(jetton_wrappers.MintMessage{
			QueryID:     queryID,
			Destination: jettonSender.Contract.Address,
			TonAmount:   tlb.MustFromTON("0.05"),
			MasterMsg: jetton_wrappers.JettonInternalTransferMessage{
				QueryID:          queryID,
				Amount:           jettonMintingAmount,
				From:             setup.deployer.Wallet.WalletAddress(),
				ResponseAddress:  setup.deployer.Wallet.WalletAddress(),
				ForwardTonAmount: tlb.ZeroCoins,
				ForwardPayload:   nil,
			},
		}, tlb.MustFromTON("0.05"))
		require.NoError(t, err, "failed to mint jettons")
		t.Logf("Msg trace:\n%s\n", replaceAddresses(
			map[string]string{
				setup.deployer.Wallet.Address().String(): "Deployer",
				jettonSender.Contract.Address.String():   "JettonSender",
				setup.jettonMinter.Address.String():      "JettonMinter",
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
		t.Logf("Deploying OnrampMock contract\n")
		onrampMock, err := jetton_wrappers.NewOnrampMockProvider(setup.common.deployer).Deploy(jetton_wrappers.OnrampMockInitData{
			MasterAddress:    setup.common.jettonMinter.Address,
			JettonWalletCode: setup.common.jettonWalletCode,
		})
		require.NoError(t, err, "failed to deploy OnrampMock contract")
		t.Logf("OnrampMock contract deployed at %s\n", onrampMock.Contract.Address.String())

		queryID := rand.Uint64()
		_, err = setup.common.jettonMinter.CallWaitRecursively(jetton_wrappers.MintMessage{
			QueryID:     queryID,
			Destination: setup.sender.Contract.Address,
			TonAmount:   tlb.MustFromTON("0.05"),
			MasterMsg: jetton_wrappers.JettonInternalTransferMessage{
				QueryID:          queryID,
				Amount:           tlb.MustFromTON("1"),
				From:             setup.common.deployer.Wallet.WalletAddress(),
				ResponseAddress:  setup.common.deployer.Wallet.WalletAddress(),
				ForwardTonAmount: tlb.ZeroCoins,
				ForwardPayload:   nil,
			},
		}, tlb.MustFromTON("0.05"))
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

		t.Logf("Deploying SimpleJettonReceiver contract\n")
		simpleJettonReceiver, err := jetton_wrappers.NewSimpleJettonReceiverProvider(setup.common.deployer).Deploy(jetton_wrappers.SimpleJettonReceiverInitData{
			JettonClient: jetton_wrappers.JettonClient{
				MasterAddress:    setup.common.jettonMinter.Address,
				JettonWalletCode: setup.common.jettonWalletCode,
			},
			AmountChecker:  tlb.MustFromTON("0"),
			PayloadChecker: nil,
		})
		require.NoError(t, err, "failed to deploy SimpleJettonReceiver contract")
		t.Logf("SimpleJettonReceiver contract deployed at %s\n", simpleJettonReceiver.Contract.Address.String())

		queryID := rand.Uint64()
		_, err = setup.common.jettonMinter.CallWaitRecursively(jetton_wrappers.MintMessage{
			QueryID:     queryID,
			Destination: setup.sender.Contract.Address,
			TonAmount:   tlb.MustFromTON("0.05"),
			MasterMsg: jetton_wrappers.JettonInternalTransferMessage{
				QueryID:          queryID,
				Amount:           tlb.MustFromTON("1"),
				From:             setup.common.deployer.Wallet.WalletAddress(),
				ResponseAddress:  setup.common.deployer.Wallet.WalletAddress(),
				ForwardTonAmount: tlb.ZeroCoins,
				ForwardPayload:   nil,
			},
		}, tlb.MustFromTON("0.05"))
		require.NoError(t, err, "failed to mint additional jettons for receiver tests")

		return &simpleJettonReceiverSetup{
			common:         setup.common,
			jettonSender:   setup.sender,
			simpleReceiver: &simpleJettonReceiver,
		}
	}

	type walletSetup struct {
		common               commonSetup
		deployerJettonWallet *jetton.WalletClient
	}

	setupJettonWallet := func(t *testing.T) *walletSetup {
		setup := setUpCommon(t)

		t.Logf("Minting jettons to sender contract\n")
		queryID := rand.Uint64()
		sendMintMsg, err := setup.jettonMinter.CallWaitRecursively(jetton_wrappers.MintMessage{
			QueryID:     queryID,
			Destination: setup.deployer.Wallet.WalletAddress(),
			TonAmount:   tlb.MustFromTON("0.05"),
			MasterMsg: jetton_wrappers.JettonInternalTransferMessage{
				QueryID:          queryID,
				Amount:           jettonMintingAmount,
				From:             setup.deployer.Wallet.WalletAddress(),
				ResponseAddress:  setup.deployer.Wallet.WalletAddress(),
				ForwardTonAmount: tlb.ZeroCoins,
				ForwardPayload:   nil,
			},
		}, tlb.MustFromTON("0.05"))
		require.NoError(t, err, "failed to mint jettons")

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
		deployerJettonWalletAddress := msgToJettonWallet.InternalMsg.DstAddr

		deployerJettonWallet, err := setup.jettonClient.GetJettonWallet(t.Context(), setup.deployer.Wallet.Address())
		require.NoError(t, err, "failed to get receiver wallet")
		require.Equal(t, deployerJettonWalletAddress, deployerJettonWallet.Address(), "Jetton Wallet Address calculated by master contract should match the cretaed one.")

		balance, err := deployerJettonWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		require.Equal(t, jettonMintingAmount.Nano().Uint64(), balance.Uint64(), "Receiver wallet balance should match sent amount")

		t.Logf("Jettons minted successfully\n")

		return &walletSetup{
			common:               setup,
			deployerJettonWallet: deployerJettonWallet,
		}
	}

	// Test: Jetton Master
	t.Run("TestJettonMasterMetadata", func(t *testing.T) {
		setup := setUpCommon(t)
		jettonData, err := setup.jettonClient.GetJettonData(t.Context())
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

	t.Run("TestJettonMasterChangeContent", func(t *testing.T) {
		setup := setUpCommon(t)
		t.Logf("Testing change content\n")
		const newContentURI = "new_content_uri"
		newContent := createStringCell(t, newContentURI)
		changeContentMsg, err := setup.jettonMinter.CallWaitRecursively(jetton_wrappers.ChangeContentMessage{
			QueryID: rand.Uint64(),
			Content: newContent,
		}, tlb.MustFromTON("0.1"))
		require.NoError(t, err, "failed to change content")
		t.Logf("Change content message received: \n%s\n", replaceAddresses(map[string]string{
			setup.deployer.Wallet.Address().String(): "Deployer",
			setup.jettonMinter.Address.String():      "JettonMinter",
			newContent.String():                      "NewContent",
		}, changeContentMsg.Dump()))

		jettonData, err := setup.jettonClient.GetJettonData(t.Context())
		require.NoError(t, err, "failed to get jetton data after content change")

		switch c := jettonData.Content.(type) {
		case *nft.ContentOnchain:
			t.Logf("On-chain content URI: %s\n", c.GetAttribute("name"))
			t.Logf("On-chain content URI: %s\n", c.GetAttribute("description"))
			t.Logf("On-chain content URI: %s\n", c.GetAttribute("image"))
			t.Fatal("On-chain content is not supported in this test, expected off-chain content")
		case *nft.ContentOffchain:
			assert.Equal(t, newContentURI, c.URI, "Off-chain content URI should match")
		case *nft.ContentSemichain:
			assert.Equal(t, newContentURI, c.URI, "Semichain content URI should match")
			t.Logf("Semichain content URI: %s\n", c.URI)
			t.Logf("On-chain content name: %s\n", c.GetAttribute("name"))
			t.Logf("On-chain content description: %s\n", c.GetAttribute("description"))
			t.Logf("On-chain content image: %s\n", c.GetAttribute("image"))
		}
	})

	t.Run("TestJettonMasterMint", func(t *testing.T) {
		setup := setUpCommon(t)
		t.Logf("Testing jetton minting\n")
		recipient := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ")
		jettonAmount := tlb.MustFromTON("0.5")
		queryID := rand.Uint64()
		mintMsg, err := setup.jettonMinter.CallWaitRecursively(jetton_wrappers.MintMessage{
			QueryID:     queryID,
			Destination: recipient,
			TonAmount:   tlb.MustFromTON("0.05"),
			MasterMsg: jetton_wrappers.JettonInternalTransferMessage{
				QueryID:          queryID,
				Amount:           jettonAmount,
				From:             setup.deployer.Wallet.WalletAddress(),
				ResponseAddress:  setup.deployer.Wallet.WalletAddress(),
				ForwardTonAmount: tlb.ZeroCoins,
				ForwardPayload:   nil,
			},
		}, tlb.MustFromTON("0.5"))
		require.NoError(t, err, "failed to mint jettons")
		t.Logf("Jetton minting message received: \n%s\n", replaceAddresses(map[string]string{
			setup.deployer.Wallet.Address().String(): "Deployer",
			setup.jettonMinter.Address.String():      "JettonMinter",
			recipient.String():                       "Recipient",
		}, mintMsg.Dump()))

		receiverWallet, err := setup.jettonClient.GetJettonWallet(t.Context(), recipient)
		require.NoError(t, err, "failed to get receiver wallet")
		balance, err := receiverWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, jettonAmount.Nano().Uint64(), balance.Uint64(), "Receiver wallet balance should match minted amount")
	})

	t.Run("TestJettonMasterChangeAdmin", func(t *testing.T) {
		setup := setUpCommon(t)
		t.Logf("Testing change admin\n")
		changeAdminMsg, err := setup.jettonMinter.CallWaitRecursively(jetton_wrappers.ChangeAdminMessage{
			QueryID:  rand.Uint64(),
			NewAdmin: setup.receiver.Wallet.Address(),
		}, tlb.MustFromTON("0.1"))
		require.NoError(t, err, "failed to change admin")
		t.Logf("Change admin message received: \n%s\n", replaceAddresses(map[string]string{
			setup.deployer.Wallet.Address().String(): "Deployer",
			setup.jettonMinter.Address.String():      "JettonMinter",
			setup.receiver.Wallet.Address().String(): "NewAdmin",
		}, changeAdminMsg.Dump()))

		jettonMinterAsReceiver := wrappers.Contract{
			Address: setup.jettonMinter.Address,
			Client:  &setup.receiver,
		}
		require.NoError(t, err, "failed to open jetton minter as new admin")
		claimAdminMsg, err := jettonMinterAsReceiver.CallWaitRecursively(jetton_wrappers.ClaimAdminMessage{QueryID: rand.Uint64()}, tlb.MustFromTON("0.1"))
		require.NoError(t, err, "failed to claim admin")
		t.Logf("Claim admin message received: \n%s\n", replaceAddresses(map[string]string{
			setup.receiver.Wallet.Address().String(): "NewAdmin",
			setup.jettonMinter.Address.String():      "JettonMinter",
		}, claimAdminMsg.Dump()))
		require.Zero(t, claimAdminMsg.ExitCode, "Claim admin message should have exit code 0")

		jettonData, err := setup.jettonClient.GetJettonData(t.Context())
		require.NoError(t, err, "failed to get jetton data after admin change")
		assert.Equal(t, setup.receiver.Wallet.Address(), jettonData.AdminAddr, "Admin address should match the new admin address")
	})

	t.Run("TestJettonMasterDropAdmin", func(t *testing.T) {
		setup := setUpCommon(t)
		t.Logf("Testing drop admin\n")
		dropAdminMsg, err := setup.jettonMinter.CallWaitRecursively(jetton_wrappers.DropAdminMessage{
			QueryID: rand.Uint64(),
		}, tlb.MustFromTON("0.1"))
		require.NoError(t, err, "failed to drop admin")
		t.Logf("Drop admin message received: \n%s\n", replaceAddresses(map[string]string{
			setup.deployer.Wallet.Address().String(): "Deployer",
			setup.jettonMinter.Address.String():      "JettonMinter",
			setup.receiver.Wallet.Address().String(): "NewAdmin",
		}, dropAdminMsg.Dump()))
		require.Zero(t, dropAdminMsg.ExitCode, "Drop admin message should have exit code 0")
		require.Len(t, dropAdminMsg.OutgoingInternalReceivedMessages, 1, "Drop admin message should have 1 outgoing message")
		msgToMinter := dropAdminMsg.OutgoingInternalReceivedMessages[0]
		require.Zero(t, msgToMinter.ExitCode, "Msg to minter should have exit code 0")
		require.Empty(t, msgToMinter.OutgoingInternalReceivedMessages, "Msg to minter should have no outgoing messages")

		queryID := rand.Uint64()
		mintMsg, err := setup.jettonMinter.CallWaitRecursively(jetton_wrappers.MintMessage{
			QueryID:     queryID,
			Destination: setup.receiver.Wallet.Address(),
			TonAmount:   tlb.MustFromTON("0.05"),
			MasterMsg: jetton_wrappers.JettonInternalTransferMessage{
				QueryID:          queryID,
				Amount:           jettonMintingAmount,
				From:             setup.deployer.Wallet.WalletAddress(),
				ResponseAddress:  setup.deployer.Wallet.WalletAddress(),
				ForwardTonAmount: tlb.ZeroCoins,
				ForwardPayload:   nil,
			},
		}, tlb.MustFromTON("0.05"))
		require.NoError(t, err, "failed to mint jettons after admin drop")
		require.Zero(t, mintMsg.ExitCode, "Mint message should have exit code 0")
		require.Len(t, mintMsg.OutgoingInternalReceivedMessages, 1, "Mint message should have 1 outgoing message")
		msgToMinter = mintMsg.OutgoingInternalReceivedMessages[0]
		require.Equal(t, jetton_wrappers.ErrorNotOwner, msgToMinter.ExitCode, "Msg to minter should have")

		jettonData, err := setup.jettonClient.GetJettonData(t.Context())
		require.NoError(t, err, "failed to get jetton data after admin change")

		// Expect admin to be the zero address after dropping admin
		assert.True(t, jettonData.AdminAddr.Equals(address.NewAddressNone()), "Admin address should be zero after dropping admin")
	})

	// Test: Jetton Send and Receive (setup sender when needed)
	t.Run("TestJettonSendFastAutodeployWallet", func(t *testing.T) {
		setup := setupJettonSender(t)
		receiver := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ")
		jettonAmount := tlb.MustFromTON("12")
		msgReceived, err := setup.sender.SendJettonsFast(
			jettonAmount,
			receiver,
		)
		require.NoError(t, err, "failed to send jettons in basic mode")
		t.Log("Jettons sent successfully")
		t.Logf("JettonSender message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			setup.sender.Contract.Address.String():          "JettonSender",
			setup.common.jettonMinter.Address.String():      "JettonMinter",
			receiver.String():                               "Receiver",
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
		// receiverJettonWallet, err := jetton_wrappers.NewJettonWalletProvider(setup.common.receiver).Deploy(setup.common.receiver.Wallet.Address(), setup.common.jettonMinter.Address)
		jettonWalletCode, err := jetton_wrappers.JettonWalletCode()
		require.NoError(t, err, "failed to deploy JettonWallet contract")
		jettonWalletInitCell, err := jetton_wrappers.NewJettonWalletProvider(setup.common.jettonMinter.Address).GetWalletInitCell(setup.common.receiver.Wallet.Address())
		require.NoError(t, err, "failed to get JettonWallet init cell")
		msg, err := tlb.ToCell(jetton_wrappers.TopUpMessage{QueryID: rand.Uint64()})
		require.NoError(t, err, "failed to create top-up message")
		receiverJettonWallet, deployMsg, err := wrappers.Deploy(&setup.common.receiver, jettonWalletCode, jettonWalletInitCell, tlb.MustFromTON("0.1"), msg)
		require.NoError(t, err, "failed to deploy JettonWallet contract")
		t.Logf("JettonWallet contract deploy message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			setup.common.receiver.Wallet.Address().String(): "Receiver",
			receiverJettonWallet.Address.String():           "ReceiverJettonWallet",
		}, deployMsg.Dump()))
		t.Logf("JettonWallet contract deployed at %s\n", receiverJettonWallet.Address.String())

		jettonAmount := tlb.MustFromTON("12")
		msgReceived, err := setup.sender.SendJettonsFast(
			jettonAmount,
			setup.common.receiver.Wallet.Address(),
		)
		require.NoError(t, err, "failed to send jettons in basic mode")
		t.Log("Jettons sent successfully")
		t.Logf("JettonSender message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			setup.sender.Contract.Address.String():          "JettonSender",
			setup.common.jettonMinter.Address.String():      "JettonMinter",
			setup.common.receiver.Wallet.Address().String(): "Receiver",
		}, msgReceived.Dump()))

		receiverWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.common.receiver.Wallet.Address())
		require.NoError(t, err, "failed to get receiver wallet")
		balance, err := receiverWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, jettonAmount.Nano().Uint64(), balance.Uint64(), "Receiver wallet balance should match sent amount")
	})

	t.Run("TestJettonSendExtended", func(t *testing.T) {
		setup := setupJettonSender(t)
		receiver := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ")
		tonAmount := tlb.MustFromTON("0.1")
		jettonAmount := tlb.MustFromTON("12")
		forwardTonAmount := tlb.MustFromTON("0.01")

		customPayload := createStringCell(t, "custom_payload")
		forwardPayload := createStringCell(t, "forward_payload")

		msgJettonsExtended, err := setup.sender.SendJettonsExtended(
			tonAmount,
			rand.Uint64(),
			jettonAmount,
			receiver,
			customPayload,
			forwardTonAmount,
			forwardPayload,
		)
		require.NoError(t, err, "failed to send jettons in basic mode")
		t.Logf("Sent jettons extended:\n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			setup.sender.Contract.Address.String():          "JettonSender",
			setup.common.jettonMinter.Address.String():      "JettonMinter",
			receiver.String():                               "Receiver",
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
		jettonTransferPayload := cell.BeginCell().MustStoreBinarySnake(buf).EndCell()

		forwardTonAmount := tlb.MustFromTON("1")
		customPayload := cell.BeginCell().MustStoreBoolBit(true).EndCell()

		jettonSenderWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.jettonSender.Contract.Address)
		require.NoError(t, err, "failed to get jetton sender wallet")
		onrampMockJettonWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.onrampMock.Contract.Address)
		require.NoError(t, err, "failed to get onramp mock jetton wallet")

		sendCallWithAmount := func(jettonAmount tlb.Coins) (tracetracking.OutgoingExternalMessages, uint64, error) {
			queryID := rand.Uint64()
			msgReceived, err2 := setup.jettonSender.SendJettonsExtended(
				tlb.MustFromTON("2"),
				queryID,
				jettonAmount,
				setup.onrampMock.Contract.Address,
				customPayload,
				forwardTonAmount,
				jettonTransferPayload,
			)
			require.NoError(t, err2, "failed to send jettons with custom payload")
			t.Logf("JettonSender message received: \n%s\n", replaceAddresses(map[string]string{
				setup.common.deployer.Wallet.Address().String(): "Deployer",
				setup.jettonSender.Contract.Address.String():    "JettonSender",
				jettonSenderWallet.Address().String():           "JettonSenderWallet",
				setup.common.jettonMinter.Address.String():      "JettonMinter",
				setup.onrampMock.Contract.Address.String():      "OnrampMock",
				onrampMockJettonWallet.Address().String():       "OnrampMockJettonWallet",
			}, msgReceived.Dump()))
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
			return eventLog, queryID, nil
		}

		insufficientJettonTransferAmount := tlb.MustFromNano(big.NewInt(1), 18)
		sufficientJettonTransferAmount := tlb.MustFromNano(big.NewInt(5), 18)

		insufficientFeeEventMessage, queryID, err := sendCallWithAmount(insufficientJettonTransferAmount)
		require.NoError(t, err, "failed to send jettons with insufficient fee")
		require.NotNil(t, insufficientFeeEventMessage, "Insufficient fee event message should not be nil")
		insufficientFeeEvent, err := jetton_wrappers.ParseInsufficientFeeEvent(insufficientFeeEventMessage.Body)
		require.NoError(t, err, "failed to parse insufficient fee event")
		assert.True(t, setup.jettonSender.Contract.Address.Equals(insufficientFeeEvent.Sender), "Sender address should match")
		assert.Equal(t, queryID, insufficientFeeEvent.QueryID, "Query ID should match")
		receiverJettonWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.onrampMock.Contract.Address)
		require.NoError(t, err, "failed to get receiver wallet")
		jettonReceiverDataAfter, err := receiverJettonWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, insufficientJettonTransferAmount.Nano().Uint64(), jettonReceiverDataAfter.Uint64(), "Receiver wallet balance should match insufficient jetton transfer amount")

		acceptedRequestEventMessage, queryID, err := sendCallWithAmount(sufficientJettonTransferAmount)
		require.NoError(t, err, "failed to send jettons with sufficient fee")
		require.NotNil(t, acceptedRequestEventMessage, "Accepted request event message should not be nil")
		acceptedRequestEvent, err := jetton_wrappers.ParseAcceptedRequestEvent(acceptedRequestEventMessage.Body)
		require.NoError(t, err, "failed to parse accepted request event")
		assert.True(t, setup.jettonSender.Contract.Address.Equals(acceptedRequestEvent.Sender), "Sender address should match")
		assert.Equal(t, queryID, acceptedRequestEvent.QueryID, "Query ID should match")
		_, payloadBuf, err := acceptedRequestEvent.Payload.BeginParse().RestBits()
		require.NoError(t, err, "failed to parse payload")
		assert.Equal(t, buf, payloadBuf, "Payload should match")
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
			rand.Uint64(),
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
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			setup.jettonSender.Contract.Address.String():    "JettonSender",
			JettonSenderWallet.Address().String():           "JettonSenderWallet",
			setup.common.jettonMinter.Address.String():      "JettonMinter",
			setup.simpleReceiver.Contract.Address.String():  "SimpleJettonReceiver",
			SimpleJettonReceiverWallet.Address().String():   "SimpleJettonReceiverWallet",
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
	t.Run("TestJettonTransferFromDeploy", func(t *testing.T) {
		setup := setupJettonWallet(t)
		t.Logf("Deploying JettonWallet contract\n")

		msg, err := tlb.ToCell(jetton_wrappers.TopUpMessage{QueryID: rand.Uint64()})
		require.NoError(t, err, "failed to create top-up message")
		jettonWalletCode, err := jetton_wrappers.JettonWalletCode()
		require.NoError(t, err, "failed to deploy JettonWallet contract")
		jettonWalletInitCell, err := jetton_wrappers.NewJettonWalletProvider(setup.common.jettonMinter.Address).GetWalletInitCell(setup.common.deployer.Wallet.Address())
		require.NoError(t, err, "failed to get JettonWallet init cell")
		deployerJettonWallet, deployMsg, err := wrappers.Deploy(&setup.common.deployer, jettonWalletCode, jettonWalletInitCell, tlb.MustFromTON("0.1"), msg)
		require.NoError(t, err, "failed to deploy JettonWallet contract")
		t.Logf("Deploy message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			setup.common.jettonMinter.Address.String():      "JettonMinter",
			deployerJettonWallet.Address.String():           "JettonWallet",
		}, deployMsg.Dump()))

		t.Logf("JettonWallet contract opened at %s\n", deployerJettonWallet.Address.String())

		deployerJettonWalletClient, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.common.deployer.Wallet.Address())
		require.NoError(t, err, "failed to get deployer jetton wallet client")

		initialDeployerBalance, err := deployerJettonWalletClient.GetBalance(t.Context())
		require.NoError(t, err)
		t.Logf("Initial sender balance %s", initialDeployerBalance.String())

		t.Logf("Testing jetton transfer\n")
		recipient := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ")
		tonAmount := tlb.MustFromTON("0.5")
		jettonAmount := tlb.MustFromTON("0.5")
		fwdTonAmount := tlb.MustFromTON("0.01")
		queryID := rand.Uint64()
		transferMsg, err := deployerJettonWallet.CallWaitRecursively(jetton.TransferPayload{
			QueryID:             queryID,
			Amount:              jettonAmount,
			Destination:         recipient,
			ResponseDestination: setup.common.deployer.Wallet.WalletAddress(),
			CustomPayload:       nil,
			ForwardTONAmount:    fwdTonAmount,
			ForwardPayload:      nil,
		}, tonAmount)
		require.NoError(t, err, "failed to transfer jettons")
		receiverJettonWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), recipient)
		require.NoError(t, err, "failed to get receiver wallet")
		t.Logf("Jetton transfer message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			deployerJettonWallet.Address.String():           "JettonWallet",
			setup.common.jettonMinter.Address.String():      "JettonMinter",
			recipient.String():                              "Receiver",
			receiverJettonWallet.Address().String():         "ReceiverJettonWallet",
		}, transferMsg.Dump()))

		jettonBalance, err := receiverJettonWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, jettonAmount.Nano().Uint64(), jettonBalance.Uint64(), "Receiver wallet balance should match sent amount")
	})

	t.Run("TestJettonTransferOpenFromInit", func(t *testing.T) {
		setup := setupJettonWallet(t)
		t.Logf("Deploying JettonWallet contract\n")

		jettonWalletCode, err := jetton_wrappers.JettonWalletCode()
		require.NoError(t, err, "failed to deploy JettonWallet contract")
		jettonWalletInitCell, err := jetton_wrappers.NewJettonWalletProvider(setup.common.jettonMinter.Address).GetWalletInitCell(setup.common.deployer.Wallet.Address())
		require.NoError(t, err, "failed to get JettonWallet init cell")
		msg, err := tlb.ToCell(jetton_wrappers.TopUpMessage{QueryID: rand.Uint64()})
		require.NoError(t, err, "failed to create top-up message")
		deployerJettonWallet, deployMsg, err := wrappers.Deploy(&setup.common.deployer, jettonWalletCode, jettonWalletInitCell, tlb.MustFromTON("0.1"), msg)
		require.NoError(t, err, "failed to deploy JettonWallet contract")
		t.Logf("Deploy message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			setup.common.jettonMinter.Address.String():      "JettonMinter",
			deployerJettonWallet.Address.String():           "JettonWallet",
		}, deployMsg.Dump()))

		t.Logf("JettonWallet contract opened at %s\n", deployerJettonWallet.Address.String())

		deployerJettonWalletClient, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.common.deployer.Wallet.Address())
		require.NoError(t, err, "failed to get deployer jetton wallet client")

		initialDeployerBalance, err := deployerJettonWalletClient.GetBalance(t.Context())
		require.NoError(t, err)
		t.Logf("Initial sender balance %s", initialDeployerBalance.String())

		t.Logf("Testing jetton transfer\n")
		recipient := address.MustParseAddr("UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ")
		tonAmount := tlb.MustFromTON("0.5")
		jettonAmount := tlb.MustFromTON("0.5")
		fwdTonAmount := tlb.MustFromTON("0.01")
		queryID := rand.Uint64()
		transferMsg, err := deployerJettonWallet.CallWaitRecursively(jetton.TransferPayload{
			QueryID:             queryID,
			Amount:              jettonAmount,
			Destination:         recipient,
			ResponseDestination: setup.common.deployer.Wallet.WalletAddress(),
			CustomPayload:       nil,
			ForwardTONAmount:    fwdTonAmount,
			ForwardPayload:      nil,
		}, tonAmount)
		require.NoError(t, err, "failed to transfer jettons")
		receiverJettonWallet, err := setup.common.jettonClient.GetJettonWallet(t.Context(), recipient)
		require.NoError(t, err, "failed to get receiver wallet")
		t.Logf("Jetton transfer message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			deployerJettonWallet.Address.String():           "JettonWallet",
			setup.common.jettonMinter.Address.String():      "JettonMinter",
			recipient.String():                              "Receiver",
			receiverJettonWallet.Address().String():         "ReceiverJettonWallet",
		}, transferMsg.Dump()))

		jettonBalance, err := receiverJettonWallet.GetBalance(t.Context())
		require.NoError(t, err, "failed to get receiver wallet balance")
		assert.Equal(t, jettonAmount.Nano().Uint64(), jettonBalance.Uint64(), "Receiver wallet balance should match sent amount")
	})

	t.Run("TestJettonBurn", func(t *testing.T) {
		setup := setupJettonWallet(t)
		t.Logf("Deploying JettonWallet contract\n")
		jettonWalletCode, err := jetton_wrappers.JettonWalletCode()
		require.NoError(t, err, "failed to deploy JettonWallet contract")
		jettonWalletInitCell, err := jetton_wrappers.NewJettonWalletProvider(setup.common.jettonMinter.Address).GetWalletInitCell(setup.common.deployer.Wallet.Address())
		require.NoError(t, err, "failed to get JettonWallet init cell")
		msg, err := tlb.ToCell(jetton_wrappers.TopUpMessage{QueryID: rand.Uint64()})
		require.NoError(t, err, "failed to create top-up message")
		jettonWallet, deployMsg, err := wrappers.Deploy(&setup.common.deployer, jettonWalletCode, jettonWalletInitCell, tlb.MustFromTON("0.1"), msg)
		require.NoError(t, err, "failed to deploy JettonWallet contract")
		t.Logf("Deploy message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			setup.common.jettonMinter.Address.String():      "JettonMinter",
			jettonWallet.Address.String():                   "JettonWallet",
		}, deployMsg.Dump()))

		t.Logf("JettonWallet contract deployed at %s\n", jettonWallet.Address.String())

		jettonWalletClient, err := setup.common.jettonClient.GetJettonWallet(t.Context(), setup.common.deployer.Wallet.Address())
		require.NoError(t, err, "failed to get jetton wallet client")

		initialBalance, err := jettonWalletClient.GetBalance(t.Context())
		require.NoError(t, err, "failed to get initial jetton balance")

		jettonAmountToBurn := tlb.MustFromNano(big.NewInt(0).Div(initialBalance, big.NewInt(2)), tlb.ZeroCoins.Decimals())
		t.Logf("Jetton amount to burn: %s", jettonAmountToBurn.String())
		queryID := rand.Uint64()
		burnMsg, err := jettonWallet.CallWaitRecursively(jetton.BurnPayload{
			QueryID:             queryID,
			Amount:              jettonAmountToBurn,
			ResponseDestination: setup.common.deployer.Wallet.WalletAddress(),
			CustomPayload:       nil,
		}, tlb.MustFromTON("0.1"))
		require.NoError(t, err, "failed to burn jettons")

		t.Logf("Jetton transfer message received: \n%s\n", replaceAddresses(map[string]string{
			setup.common.deployer.Wallet.Address().String(): "Deployer",
			jettonWallet.Address.String():                   "JettonWallet",
			setup.common.jettonMinter.Address.String():      "JettonMinter",
		}, burnMsg.Dump()))

		balanceAfterBurn, err := jettonWalletClient.GetBalance(t.Context())
		require.NoError(t, err, "failed to get jetton balance after burn")
		assert.Equal(t, initialBalance.Uint64()-jettonAmountToBurn.Nano().Uint64(), balanceAfterBurn.Uint64(), "Jetton balance after burn should match expected")
		t.Logf("Jetton burn test passed\n")

		t.Logf("All jetton wallet operations tests completed successfully\n")
	})
}

func DeployMinter(t *testing.T, deployer *tracetracking.SignedAPIClient, initData jetton_wrappers.JettonMinterInitData) *wrappers.Contract {
	minterCode, err := jetton_wrappers.JettonMinterCode()
	require.NoError(t, err, "failed to load JettonMinter code")
	topUpMsg, err := tlb.ToCell(jetton_wrappers.TopUpMessage{
		QueryID: rand.Uint64(),
	})
	require.NoError(t, err, "failed to create TopUp message")
	minterInitCell, err := tlb.ToCell(initData)
	require.NoError(t, err, "failed to create JettonMinter init data cell")
	minterContract, deployMsg, err := wrappers.Deploy(deployer, minterCode, minterInitCell, tlb.MustFromTON("1"), topUpMsg)
	t.Logf("Deploy trace: %s\n", replaceAddresses(map[string]string{
		deployer.Wallet.Address().String(): "Deployer",
	}, deployMsg.Dump()))
	require.NoError(t, err, "failed to deploy JettonMinter contract")
	return minterContract
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
