package jetton

import (
	"fmt"

	"path"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

const (
	ErrorInvalidOp      tvm.ExitCode = tvm.ExitCode(72)
	ErrorWrongOp        tvm.ExitCode = tvm.ExitCode(0xffff)
	ErrorNotOwner       tvm.ExitCode = tvm.ExitCode(73)
	ErrorNotValidWallet tvm.ExitCode = tvm.ExitCode(74)
	ErrorWrongWorkchain tvm.ExitCode = tvm.ExitCode(333)
)

// JettonMinter opcodes
const (
	OpcodeMinterMint              = 0x642b7d07
	OpcodeMinterBurnNotification  = 0x7bdd97de
	OpcodeMinterChangeAdmin       = 0x6501f354
	OpcodeMinterClaimAdmin        = 0xfb88e119
	OpcodeMinterDropAdmin         = 0x7431f221
	OpcodeMinterChangeMetadataURL = 0xcb862902
	OpcodeMinterUpgrade           = 0x2508d66a
	OpcodeMinterInternalTransfer  = 0x178d4519
	OpcodeMinterExcesses          = 0xd53276db
)

var MinterContractPath = path.Join(PathToContracts, "JettonMinter.compiled.json")

type MinterInitData struct {
	TotalSupply   tlb.Coins        `tlb:"."`
	Admin         *address.Address `tlb:"addr"`
	TransferAdmin *address.Address `tlb:"addr"`
	WalletCode    *cell.Cell       `tlb:"^"`
	JettonContent *cell.Cell       `tlb:"^"`
}

func MinterCode() (*cell.Cell, error) {
	compiledContract, err := wrappers.ParseCompiledContract(MinterContractPath)
	if err != nil {
		return nil, fmt.Errorf("failed to compile contract: %w", err)
	}
	return compiledContract, nil
}

// For funding the contract with TON
type TopUpMessage struct {
	_       tlb.Magic `tlb:"#d372158c"` //nolint:revive // This field should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

type InternalTransferMessage struct {
	_                tlb.Magic        `tlb:"#178d4519"` //nolint:revive // This field should stay uninitialized
	QueryID          uint64           `tlb:"## 64"`
	Amount           tlb.Coins        `tlb:"."`
	From             *address.Address `tlb:"addr"`
	ResponseAddress  *address.Address `tlb:"addr"`
	ForwardTonAmount tlb.Coins        `tlb:"."`
	ForwardPayload   *cell.Cell       `tlb:"either . ^"`
}

type MintMessage struct {
	_           tlb.Magic               `tlb:"#642b7d07"` //nolint:revive // This field should stay uninitialized
	QueryID     uint64                  `tlb:"## 64"`
	Destination *address.Address        `tlb:"addr"`
	TonAmount   tlb.Coins               `tlb:"."`
	MasterMsg   InternalTransferMessage `tlb:"^"`
}

type ChangeAdminMessage struct {
	_        tlb.Magic        `tlb:"#6501f354"` //nolint:revive // This field should stay uninitialized
	QueryID  uint64           `tlb:"## 64"`
	NewAdmin *address.Address `tlb:"addr"`
}

type ClaimAdminMessage struct {
	_       tlb.Magic `tlb:"#fb88e119"` //nolint:revive // This field should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

type DropAdminMessage struct {
	_       tlb.Magic `tlb:"#7431f221"` //nolint:revive // This field should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

type ChangeContentMessage struct {
	_       tlb.Magic  `tlb:"#cb862902"` //nolint:revive // This field should stay uninitialized
	QueryID uint64     `tlb:"## 64"`
	Content *cell.Cell `tlb:"^"`
}

type UpgradeMessage struct {
	_       tlb.Magic  `tlb:"#2508d66a"` //nolint:revive // This field should stay uninitialized
	QueryID uint64     `tlb:"## 64"`
	NewData *cell.Cell `tlb:"^"`
	NewCode *cell.Cell `tlb:"^"`
}
