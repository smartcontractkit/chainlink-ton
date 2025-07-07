package twophasecommit

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var DbContractPath = test_utils.GetBuildDir("examples.async-communication.two-phase-commit.DB/tact_DB.pkg")

type DBProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewDBProvider(apiClient tracetracking.SignedAPIClient) *DBProvider {
	return &DBProvider{
		apiClient: apiClient,
	}
}

type DBInitData struct {
	ID uint32
}

func (p *DBProvider) Deploy(initData DBInitData) (DB, error) {
	// Deploy the contract
	c := cell.BeginCell()
	err := c.StoreUInt(0, 1) // For some reason, if the contract is defined with an init function, you must write a 0 bit before the arguments
	if err != nil {
		return DB{}, fmt.Errorf("failed to store init bit: %w", err)
	}
	err = c.StoreUInt(uint64(initData.ID), 32)
	if err != nil {
		return DB{}, fmt.Errorf("failed to store ID: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(DbContractPath)
	if err != nil {
		return DB{}, fmt.Errorf("Failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, c.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return DB{}, err
	}

	return DB{
		Contract: *contract,
	}, nil
}

type DB struct {
	Contract wrappers.Contract
}

type beginTransactionMessage struct {
	queryID uint64
}

func (m beginTransactionMessage) OpCode() uint64 {
	return 0x1
}
func (m beginTransactionMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	return nil
}

func (s DB) SendBeginTransaction(queryID uint64) (msgReceived *tracetracking.ReceivedMessage, err error) {
	msgReceived, err = s.Contract.CallWaitRecursively(beginTransactionMessage{queryID}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

type setValueMessage struct {
	queryID uint64
	Counter *address.Address
	Value   uint32
}

func (m setValueMessage) OpCode() uint64 {
	return 0x2
}
func (m setValueMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreAddr(m.Counter)
	if err != nil {
		return fmt.Errorf("failed to store Counter address: %w", err)
	}
	err = b.StoreUInt(uint64(m.Value), 32)
	if err != nil {
		return fmt.Errorf("failed to store Value: %w", err)
	}
	return nil
}

func (s DB) SendSetValue(counterAddr *address.Address, value uint32) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64() //nolint:gosec
	msgReceived, err = s.Contract.CallWaitRecursively(setValueMessage{queryID, counterAddr, value}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

type commitMessage struct {
	queryID uint64
}

func (m commitMessage) OpCode() uint64 {
	return 0x5
}
func (m commitMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	return nil
}

func (s DB) SendCommit() (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64() //nolint:gosec
	msgReceived, err = s.Contract.CallWaitRecursively(commitMessage{queryID}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
