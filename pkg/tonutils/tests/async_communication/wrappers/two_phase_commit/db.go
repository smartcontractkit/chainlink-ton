package two_phase_commit

import (
	"fmt"
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var DB_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.two-phase-commit.DB/tact_DB.pkg")

type DBProvider struct {
	apiClient tonutils.SignedAPIClient
}

func NewDBProvider(apiClient tonutils.SignedAPIClient) *DBProvider {
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
	c.StoreUInt(0, 1) // For some reason, if the contract is defined with an init function, you must write a 0 bit before the arguments
	c.StoreUInt(uint64(initData.ID), 32)
	contractCode, err := tonutils.CompiledContract(DB_CONTRACT_PATH)
	if err != nil {
		return DB{}, fmt.Errorf("Failed to compile contract: %v", err)
	}
	contract, err := p.apiClient.Deploy(contractCode, c.EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return DB{}, err
	}

	return DB{
		Contract: *contract,
	}, nil
}

type DB struct {
	Contract tonutils.Contract
}

type beginTransactionMethod struct {
	queryId uint64
}

func (m beginTransactionMethod) OpCode() uint64 {
	return 0x1
}
func (m beginTransactionMethod) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(m.queryId, 64)
	return nil
}

func (s DB) BeginTransaction(queryId uint64) (msgReceived *tonutils.ReceivedMessage, err error) {
	msgReceived, err = s.Contract.CallWaitRecursively(beginTransactionMethod{queryId}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

type setValueMethod struct {
	queryId uint64
	Counter *address.Address
	Value   uint32
}

func (m setValueMethod) OpCode() uint64 {
	return 0x2
}
func (m setValueMethod) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(m.queryId, 64)
	b.StoreAddr(m.Counter)
	b.StoreUInt(uint64(m.Value), 32)
	return nil
}

func (s DB) SetValue(counterAddr *address.Address, value uint32) (msgReceived *tonutils.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(setValueMethod{queryId, counterAddr, value}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

type commitMethod struct {
	queryId uint64
}

func (m commitMethod) OpCode() uint64 {
	return 0x5
}
func (m commitMethod) StoreArgs(b *cell.Builder) error {
	b.StoreUInt(m.queryId, 64)
	return nil
}

func (s DB) Commit() (msgReceived *tonutils.ReceivedMessage, err error) {
	queryId := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(commitMethod{queryId}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
