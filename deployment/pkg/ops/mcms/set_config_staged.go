package mcms // alias: opsmcms

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/mcms/sdk"
	mcmstypes "github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
)

// StageConfigChunkSize is the maximum number of signers accepted by one stageConfig call.
// It mirrors MAX_SIGNERS_PER_STAGE in the MCMS contract.
const (
	// StageConfigChunkSize is the maximum number of signers accepted by one stageConfig call.
	StageConfigChunkSize = 32
	// MaxStagedConfigSigners mirrors the MCMS contract maximum.
	MaxStagedConfigSigners = 200
)

type SetConfigStagedInput struct {
	Bounce  bool             `json:"bounce"`
	DstAddr *address.Address `json:"dstAddr"`
	Amount  tlb.Coins        `json:"amount"`

	Config    *mcmstypes.Config `json:"config"`
	ClearRoot bool              `json:"clearRoot"`
}

// SetConfigStaged plans the begin/stage/commit messages required to install a config
// that is too large for one setConfig call. It intentionally supports planning only:
// the staged flow must execute through the Timelock/MCMS batch.
var SetConfigStaged = cldfops.NewOperation(
	"ton/ops/mcms/set-config-staged",
	semver.MustParse("0.1.0"),
	"Plans begin/stage/commit messages for a large MCMS config",
	func(b cldfops.Bundle, dp *dep.DependencyProvider, in SetConfigStagedInput) (opston.SendMessagesOutput, error) {
		_, err := dep.Resolve[cldfton.Chain](dp)
		if err != nil {
			return opston.SendMessagesOutput{}, fmt.Errorf("failed to resolve chain: %w", err)
		}
		if in.DstAddr == nil {
			return opston.SendMessagesOutput{}, errors.New("destination address (DstAddr) is required")
		}
		plans, err := buildStagedConfigPlans(in.DstAddr, in.Amount, in.Config, in.ClearRoot, in.Bounce)
		if err != nil {
			return opston.SendMessagesOutput{}, err
		}
		return opston.SendMessagesOutput{Plans: plans}, nil
	},
)

func buildStagedConfigPlans(dst *address.Address, amount tlb.Coins, cfg *mcmstypes.Config, clearRoot, bounce bool) ([]opston.MessagePlanRaw, error) {
	if dst == nil {
		return nil, errors.New("destination address is required")
	}
	if cfg == nil {
		return nil, errors.New("config is required")
	}

	groupQuorums, groupParents, signerAddresses, signerGroups, err := sdk.ExtractSetConfigInputs(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to extract MCMS config inputs: %w", err)
	}
	if len(signerAddresses) == 0 {
		return nil, errors.New("MCMS config must contain at least one signer")
	}
	if len(signerAddresses) > MaxStagedConfigSigners {
		return nil, fmt.Errorf("MCMS config has %d signers, maximum is %d", len(signerAddresses), MaxStagedConfigSigners)
	}

	queryID, err := deterministicStagedQueryID(dst, cfg, clearRoot)
	if err != nil {
		return nil, fmt.Errorf("failed to build staged query ID: %w", err)
	}

	gqDict, err := tlbe.NewDictFromSlice[uint8](groupQuorums[:])
	if err != nil {
		return nil, fmt.Errorf("failed to create group quorums dict: %w", err)
	}
	gpDict, err := tlbe.NewDictFromSlice[uint8](groupParents[:])
	if err != nil {
		return nil, fmt.Errorf("failed to create group parents dict: %w", err)
	}

	plans := make([]opston.MessagePlanRaw, 0, 2+(len(signerAddresses)+StageConfigChunkSize-1)/StageConfigChunkSize)
	addPlan := func(body *cell.Cell) error {
		mcell, err := tlbe.NewCellFrom(tlb.InternalMessage{
			Bounce:  bounce,
			DstAddr: dst,
			Amount:  amount,
			Body:    body,
		})
		if err != nil {
			return err
		}
		opcode, err := tvm.ExtractOpcode(body)
		if err != nil {
			return err
		}
		plans = append(plans, opston.MessagePlanRaw{
			Opcode:  opcode,
			DstAddr: dst,
			Amount:  amount,
			Cell:    mcell,
		})
		return nil
	}

	beginBody, err := tlb.ToCell(mcms.BeginConfigStaging{
		QueryID:      queryID,
		GroupQuorums: gqDict,
		GroupParents: gpDict,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to encode beginConfigStaging: %w", err)
	}
	if err := addPlan(beginBody); err != nil {
		return nil, fmt.Errorf("failed to plan beginConfigStaging: %w", err)
	}

	for offset := 0; offset < len(signerAddresses); offset += StageConfigChunkSize {
		end := offset + StageConfigChunkSize
		if end > len(signerAddresses) {
			end = len(signerAddresses)
		}
		chunk := make([]mcms.SignerAddress, end-offset)
		groups := make([]mcms.SignerGroup, end-offset)
		for i := offset; i < end; i++ {
			chunk[i-offset] = mcms.SignerAddress{Val: tlbe.NewUint160(signerAddresses[i].Big())}
			groups[i-offset] = mcms.SignerGroup{Val: signerGroups[i]}
		}

		body, err := tlb.ToCell(mcms.StageConfig{
			QueryID:            queryID,
			ExpectedNumSigners: uint16(offset),
			SignerAddresses:    chunk,
			SignerGroups:       groups,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to encode stageConfig chunk %d: %w", offset, err)
		}
		if err := addPlan(body); err != nil {
			return nil, fmt.Errorf("failed to plan stageConfig chunk %d: %w", offset, err)
		}
	}

	commitBody, err := tlb.ToCell(mcms.CommitConfig{
		QueryID:            queryID,
		ExpectedNumSigners: uint16(len(signerAddresses)),
		ClearRoot:          clearRoot,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to encode commitConfig: %w", err)
	}
	if err := addPlan(commitBody); err != nil {
		return nil, fmt.Errorf("failed to plan commitConfig: %w", err)
	}

	return plans, nil
}

func deterministicStagedQueryID(dst *address.Address, cfg *mcmstypes.Config, clearRoot bool) (uint64, error) {
	cfgJSON, err := json.Marshal(cfg)
	if err != nil {
		return 0, fmt.Errorf("failed to marshal config: %w", err)
	}
	h := sha256.New()
	h.Write([]byte(dst.String()))
	h.Write([]byte{0})
	h.Write([]byte("MCMS:SetConfigStaged"))
	h.Write([]byte{0})
	h.Write(cfgJSON)
	if clearRoot {
		h.Write([]byte{1})
	} else {
		h.Write([]byte{0})
	}
	qID := binary.BigEndian.Uint64(h.Sum(nil)[:8])
	if qID == 0 {
		return 1, nil
	}
	return qID, nil
}
