package twophasecommit

import (
	"fmt"
	"math/rand/v2"

	test_utils "integration-tests/utils"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

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
	ID uint32 `tlb:"## 32"`
}

func (p *DBProvider) Deploy(initData DBInitData) (DB, error) {
	initDataCell, err := tlb.ToCell(wrappers.LazyLoadingTactContractInitData(initData))
	if err != nil {
		return DB{}, fmt.Errorf("failed to serialize init data: %w", err)
	}
	compiledContract, err := wrappers.ParseCompiledContract(DbContractPath)
	if err != nil {
		return DB{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"))
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
	_       tlb.Magic `tlb:"#00000001"`
	queryID uint64    `tlb:"## 64"`
}

func (m beginTransactionMessage) OpCode() uint64 {
	return 0x1
}

func (s DB) SendBeginTransaction(queryID uint64) (msgReceived *tracetracking.ReceivedMessage, err error) {
	msgReceived, err = s.Contract.CallWaitRecursively(beginTransactionMessage{
		queryID: queryID,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

type setValueMessage struct {
	_       tlb.Magic        `tlb:"#00000002"`
	queryID uint64           `tlb:"## 64"`
	Counter *address.Address `tlb:"addr"`
	Value   uint32           `tlb:"## 32"`
}

func (m setValueMessage) OpCode() uint64 {
	return 0x2
}

func (s DB) SendSetValue(counterAddr *address.Address, value uint32) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(setValueMessage{
		queryID: queryID,
		Counter: counterAddr,
		Value:   value,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}

type commitMessage struct {
	_       tlb.Magic `tlb:"#00000005"`
	queryID uint64    `tlb:"## 64"`
}

func (m commitMessage) OpCode() uint64 {
	return 0x5
}

func (s DB) SendCommit() (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = s.Contract.CallWaitRecursively(commitMessage{
		queryID: queryID,
	}, tlb.MustFromTON("0.5"))
	return msgReceived, err
}
