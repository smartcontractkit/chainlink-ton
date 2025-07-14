package wrappers

import (
	"fmt"
	"math/big"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var JettonSenderContractPath = test_utils.GetBuildDir("examples.jetton.JettonSender.compiled.json")

type JettonSenderProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewJettonSenderProvider(apiClient tracetracking.SignedAPIClient) *JettonSenderProvider {
	return &JettonSenderProvider{
		apiClient: apiClient,
	}
}

type JettonSenderInitData struct {
	MasterAddress    *address.Address
	JettonWalletCode *cell.Cell
}

func (p *JettonSenderProvider) Deploy(initData JettonSenderInitData) (*JettonSender, error) {
	// Deploy the contract
	b := cell.BeginCell()
	err := b.StoreAddr(initData.MasterAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to store MasterAddress: %w", err)
	}
	err = b.StoreRef(initData.JettonWalletCode)
	if err != nil {
		return nil, fmt.Errorf("failed to store JettonWalletCode: %w", err)
	}

	compiledContract, err := wrappers.ParseCompiledContract(JettonSenderContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, b.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return nil, err
	}

	return &JettonSender{
		Contract: *contract,
	}, nil
}

type JettonSender struct {
	Contract wrappers.Contract
}

type sendJettonsFastMessage struct {
	queryID     uint64
	amount      *big.Int
	destination *address.Address
}

func (m sendJettonsFastMessage) OpCode() uint64 {
	return 0x6984f9bb
}

func (m sendJettonsFastMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreBigCoins(m.amount)
	if err != nil {
		return fmt.Errorf("failed to store amount: %w", err)
	}
	err = b.StoreAddr(m.destination)
	if err != nil {
		return fmt.Errorf("failed to store destination: %w", err)
	}
	return nil
}

func (s JettonSender) SendJettonsFast(amount *big.Int, destination *address.Address) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(sendJettonsFastMessage{
		queryID:     queryID,
		amount:      amount,
		destination: destination,
	}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

type sendJettonsExtendedMessage struct {
	queryID          uint64
	amount           *big.Int
	destination      *address.Address
	customPayload    *cell.Cell
	forwardTonAmount *big.Int
	forwardPayload   *cell.Cell
}

func (m sendJettonsExtendedMessage) OpCode() uint64 {
	return 0xe815f1d0
}

func (m sendJettonsExtendedMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreBigCoins(m.amount)
	if err != nil {
		return fmt.Errorf("failed to store amount: %w", err)
	}
	err = b.StoreAddr(m.destination)
	if err != nil {
		return fmt.Errorf("failed to store destination: %w", err)
	}
	err = b.StoreRef(m.customPayload)
	if err != nil {
		return fmt.Errorf("failed to store customPayload: %w", err)
	}
	err = b.StoreBigCoins(m.forwardTonAmount)
	if err != nil {
		return fmt.Errorf("failed to store forwardTonAmount: %w", err)
	}
	err = b.StoreRef(m.forwardPayload)
	if err != nil {
		return fmt.Errorf("failed to store forwardPayload: %w", err)
	}
	return nil
}

func (s JettonSender) SendJettonsExtended(tonAmount tlb.Coins, jettonAmount *big.Int, destination *address.Address, customPayload *cell.Cell, forwardTonAmount *big.Int, forwardPayload *cell.Cell) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(sendJettonsExtendedMessage{
		queryID:          queryID,
		amount:           jettonAmount,
		destination:      destination,
		customPayload:    customPayload,
		forwardTonAmount: forwardTonAmount,
		forwardPayload:   forwardPayload,
	}, tonAmount)
	return msgReceived, err
}
