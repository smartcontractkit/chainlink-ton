package two_phase_commit

import (
	"math/rand/v2"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var DB_CONTRACT_PATH = test_utils.GetBuildDir("examples.async-communication.two-phase-commit.DB/tact_DB.pkg")

type DBProvider struct {
	apiClient tonutils.ApiClient
}

func NewDBProvider(apiClient tonutils.ApiClient) *DBProvider {
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
	contract, err := p.apiClient.Deploy(DB_CONTRACT_PATH, c.EndCell(), tlb.MustFromTON("1"))
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

type beginTransaction struct{}

func (m beginTransaction) OpCode() uint64 {
	return 0x1
}
func (m beginTransaction) StoreArgs(b *cell.Builder) error {
	return nil
}

func (s DB) BeginTransaction() (queryID uint64, msgReceived *tonutils.ReceivedMessage, err error) {
	queryID = rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(beginTransaction{}, queryID, tlb.MustFromTON("0.5"))
	return queryID, msgReceived, err
}

type setValue struct {
	Counter *address.Address
	Value   uint32
}

func (m setValue) OpCode() uint64 {
	return 0x2
}
func (m setValue) StoreArgs(b *cell.Builder) error {
	b.StoreAddr(m.Counter)
	b.StoreUInt(uint64(m.Value), 32)
	return nil
}

func (s DB) SetValue(counterAddr *address.Address, value uint32) (msgReceived *tonutils.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(setValue{
		Counter: counterAddr,
		Value:   value,
	}, queryID, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

type commit struct{}

func (m commit) OpCode() uint64 {
	return 0x5
}
func (m commit) StoreArgs(b *cell.Builder) error {
	return nil
}

func (s DB) Commit() (queryID uint64, msgReceived *tonutils.ReceivedMessage, err error) {
	queryID = rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(commit{}, queryID, tlb.MustFromTON("0.5"))
	return queryID, msgReceived, err
}
