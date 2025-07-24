package wrappers

import (
	"fmt"
	"math/big"
	"math/rand/v2"
	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/jetton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

var JettonWalletContractPath = path.Join(PathContractsJetton, "JettonWallet.compiled.json")

type JettonWalletProvider struct {
	apiClient tracetracking.SignedAPIClient
}

func NewJettonWalletProvider(apiClient tracetracking.SignedAPIClient) *JettonWalletProvider {
	return &JettonWalletProvider{
		apiClient: apiClient,
	}
}

type JettonWalletInitData struct {
	Status              uint8            `tlb:"## 8"`
	Balance             *big.Int         `tlb:"var uint 16"`
	OwnerAddress        *address.Address `tlb:"addr"`
	JettonMasterAddress *address.Address `tlb:"addr"`
}

func (p *JettonWalletProvider) Deploy(initData JettonWalletInitData) (JettonWallet, error) {
	compiledContract, err := wrappers.ParseCompiledContract(JettonWalletContractPath)
	if err != nil {
		return JettonWallet{}, fmt.Errorf("failed to compile contract: %w", err)
	}
	initDataCell, err := tlb.ToCell(initData)
	if err != nil {
		return JettonWallet{}, fmt.Errorf("failed to convert init data to cell: %w", err)
	}
	contract, err := wrappers.Deploy(&p.apiClient, compiledContract, initDataCell, tlb.MustFromTON("1"))
	if err != nil {
		return JettonWallet{}, err
	}

	return JettonWallet{
		Contract: *contract,
	}, nil
}

type JettonWallet struct {
	Contract wrappers.Contract
}

// JettonWallet opcodes
const (
	JettonWalletTransfer             = 0x0f8a7ea5
	JettonWalletTransferNotification = 0x7362d09c
	JettonWalletInternalTransfer     = 0x178d4519
	JettonWalletExcesses             = 0xd53276db
	JettonWalletBurn                 = 0x595f07bc
	JettonWalletBurnNotification     = 0x7bdd97de
)

func (m transferMessage) OpCode() uint64 {
	return JettonWalletTransfer
}

func (m transferMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreBigCoins(m.jettonAmount)
	if err != nil {
		return fmt.Errorf("failed to store jettonAmount: %w", err)
	}
	err = b.StoreAddr(m.destination)
	if err != nil {
		return fmt.Errorf("failed to store destination: %w", err)
	}
	err = b.StoreAddr(m.responseDestination)
	if err != nil {
		return fmt.Errorf("failed to store responseDestination: %w", err)
	}

	// Store custom payload
	if m.customPayload != nil {
		err = b.StoreBoolBit(true)
		if err != nil {
			return fmt.Errorf("failed to store custom payload flag: %w", err)
		}
		err = b.StoreRef(m.customPayload)
		if err != nil {
			return fmt.Errorf("failed to store custom payload: %w", err)
		}
	} else {
		err = b.StoreBoolBit(false)
		if err != nil {
			return fmt.Errorf("failed to store custom payload flag: %w", err)
		}
	}

	err = b.StoreBigCoins(m.forwardTonAmount)
	if err != nil {
		return fmt.Errorf("failed to store forwardTonAmount: %w", err)
	}

	// Store forward payload
	err = m.forwardPayload.Store(b)
	if err != nil {
		return fmt.Errorf("failed to store forward payload: %w", err)
	}

	return nil
}

type autoparseMsg struct {
	body jetton.TransferPayload
}

func (m autoparseMsg) OpCode() uint64 {
	return 0
}

func (m autoparseMsg) StoreArgs(b *cell.Builder) error {
	asCell, err := tlb.ToCell(m.body)
	if err != nil {
		return fmt.Errorf("failed to convert TransferPayload to cell: %w", err)
	}
	err = b.StoreBuilder(asCell.ToBuilder())
	if err != nil {
		return fmt.Errorf("failed to store TransferPayload cell: %w", err)
	}
	return nil
}

func (w JettonWallet) SendTransfer(tonAmount tlb.Coins, jettonAmount *big.Int, destination *address.Address, responseDestination *address.Address, customPayload *cell.Cell, forwardTonAmount *big.Int, forwardPayload ForwardPayload) (msgReceived *tracetracking.ReceivedMessage, err error) {
	// if forwardPayload == nil {
	// 	forwardPayload = NewForwardPayload(cell.BeginCell().EndCell())
	// }
	queryID := rand.Uint64()
	msgReceived, err = w.Contract.CallWaitRecursively(autoparseMsg{
		body: jetton.TransferPayload{
			QueryID:             queryID,
			Amount:              tonAmount,
			Destination:         destination,
			ResponseDestination: responseDestination,
			CustomPayload:       customPayload,
			ForwardTONAmount:    tonAmount,
			ForwardPayload:      cell.BeginCell().EndCell(), // TODO accept forward payload
		},
	}, tonAmount)
	return msgReceived, err
}

type burnMessage struct {
	queryID             uint64
	jettonAmount        tlb.Coins
	responseDestination *address.Address
	customPayload       *cell.Cell
}

func (m burnMessage) OpCode() uint64 {
	return JettonWalletBurn
}

func (m burnMessage) StoreArgs(b *cell.Builder) error {
	err := b.StoreUInt(m.queryID, 64)
	if err != nil {
		return fmt.Errorf("failed to store queryID: %w", err)
	}
	err = b.StoreBigCoins(m.jettonAmount.Nano())
	if err != nil {
		return fmt.Errorf("failed to store jettonAmount: %w", err)
	}
	err = b.StoreAddr(m.responseDestination)
	if err != nil {
		return fmt.Errorf("failed to store responseDestination: %w", err)
	}

	// Store custom payload
	if m.customPayload != nil {
		err = b.StoreBoolBit(true)
		if err != nil {
			return fmt.Errorf("failed to store custom payload flag: %w", err)
		}
		err = b.StoreRef(m.customPayload)
		if err != nil {
			return fmt.Errorf("failed to store custom payload: %w", err)
		}
	} else {
		err = b.StoreBoolBit(false)
		if err != nil {
			return fmt.Errorf("failed to store custom payload flag: %w", err)
		}
	}

	return nil
}

func (w JettonWallet) SendBurn(jettonAmount tlb.Coins, responseDestination *address.Address, customPayload *cell.Cell) (msgReceived *tracetracking.ReceivedMessage, err error) {
	queryID := rand.Uint64()
	msgReceived, err = w.Contract.CallWaitRecursively(burnMessage{
		queryID:             queryID,
		jettonAmount:        jettonAmount,
		responseDestination: responseDestination,
		customPayload:       customPayload,
	}, tlb.MustFromTON("0.1"))
	return msgReceived, err
}

// Getter methods
func (w JettonWallet) GetJettonBalance() (*tlb.Coins, error) {
	result, err := w.Contract.Get("get_wallet_data")
	if err != nil {
		return nil, fmt.Errorf("failed to get wallet data: %w", err)
	}
	amount, err := result.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to parse amount: %w", err)
	}
	coins := tlb.MustFromNano(amount, 18)
	return &coins, nil

}

func (w JettonWallet) GetWalletStatus() (uint32, error) {
	return wrappers.Uint32From(w.Contract.Get("get_wallet_data"))
}
