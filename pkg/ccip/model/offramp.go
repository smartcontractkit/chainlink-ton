package model

import (
	"encoding/hex"
	"fmt"
	"math"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// ---------- OffRamp Model Struct Definitions ----------

type OffRampStorage struct {
	ID                                      uint32                       `json:"id"`
	Ownable                                 Ownable2Step                 `json:"ownable"`
	Deployables                             Deployables                  `json:"deployables"`
	FeeQuoter                               *address.Address             `json:"feeQuoter"`
	OCR3Base                                OCR3Base                     `json:"ocr3Base"`
	CursedSubjects                          []*big.Int                   `json:"cursedSubjects"`
	ChainSelector                           uint64                       `json:"chainSelector"`
	PermissionlessExecutionThresholdSeconds uint32                       `json:"PermissionlessExecutionThresholdSeconds"`
	SourceChainConfigs                      map[uint64]SourceChainConfig `json:"SourceChainConfigs"`
	LatestPriceSequenceNumber               uint64                       `json:"LatestPriceSequenceNumber"`
}

type Deployables struct {
	RMNRouter           *address.Address `json:"rmnRouter"`
	Deployer            string           `json:"deployerHex"`
	MerkleRootCode      string           `json:"MerkleRootCodeHex"`
	ReceiveExecutorCode string           `json:"ReceiveExecutorCodeHex"`
}

type OCR3Base struct {
	ChainID int         `json:"chainID"`
	Commit  *OCR3Config `json:"commit"`
	Execute *OCR3Config `json:"execute"`
}

type OCR3Config struct {
	Signers                        []string           `json:"signers"`
	Transmitters                   []*address.Address `json:"transmitters"`
	ConfigDigest                   string             `json:"configDigestHex"`
	F                              int                `json:"F"`
	N                              int                `json:"N"`
	IsSignatureVerificationEnabled bool               `json:"IsSignatureVerificationEnabled"`
}

type SourceChainConfig struct {
	Router                    *address.Address `json:"Router"`
	IsEnabled                 bool             `json:"IsEnabled"`
	MinSeqNr                  uint64           `json:"MinSeqNr"`
	IsRMNVerificationDisabled bool             `json:"IsRMNVerificationDisabled"`
	OnRamp                    string           `json:"OnRamp"`
}

// ---------- Builder ----------

type OffRampStorageBuilder struct {
	storage OffRampStorage
	err     error
}

// NewOffRampStorageBuilder creates a new builder with zero-value storage
// and initialized maps.
func NewOffRampStorageBuilder() *OffRampStorageBuilder {
	return &OffRampStorageBuilder{
		storage: OffRampStorage{
			SourceChainConfigs: map[uint64]SourceChainConfig{},
		},
	}
}

func (b *OffRampStorageBuilder) WithID(id uint32) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.ID = id
	return b
}

func (b *OffRampStorageBuilder) WithOwnable(owner, pending *address.Address) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.Ownable = Ownable2Step{
		Owner:        owner,
		PendingOwner: pending,
	}
	return b
}

func (b *OffRampStorageBuilder) WithFeeQuoter(fq *address.Address) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.FeeQuoter = fq
	return b
}

func (b *OffRampStorageBuilder) WithRMNRouter(router *address.Address) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.Deployables.RMNRouter = router
	return b
}

func (b *OffRampStorageBuilder) WithDeployerCode(deployerCodeHex string) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.Deployables.Deployer = deployerCodeHex
	return b
}

func (b *OffRampStorageBuilder) WithMerkleRootCode(merkleRootCode string) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.Deployables.MerkleRootCode = merkleRootCode
	return b
}

func (b *OffRampStorageBuilder) WithReceiveExecutorCode(receiveExecutorCode string) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.Deployables.ReceiveExecutorCode = receiveExecutorCode
	return b
}

func (b *OffRampStorageBuilder) WithOCR3BaseChainID(chainID int) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.OCR3Base.ChainID = chainID
	return b
}

func (b *OffRampStorageBuilder) WithOCR3CommitConfig(commit *OCR3Config) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.OCR3Base.Commit = commit
	return b
}

func (b *OffRampStorageBuilder) WithOCR3ExecuteConfig(execute *OCR3Config) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.OCR3Base.Execute = execute
	return b
}

func (b *OffRampStorageBuilder) WithCursedSubject(cursedSubject *big.Int) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}

	b.storage.CursedSubjects = append(b.storage.CursedSubjects, new(big.Int).Set(cursedSubject))
	return b
}

func (b *OffRampStorageBuilder) WithChainSelector(selector uint64) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.ChainSelector = selector
	return b
}

func (b *OffRampStorageBuilder) WithPermissionlessExecutionThresholdSeconds(v uint32) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.PermissionlessExecutionThresholdSeconds = v
	return b
}

func (b *OffRampStorageBuilder) WithSourceChainConfig(selector uint64, cfg SourceChainConfig) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.SourceChainConfigs[selector] = cfg
	return b
}

func (b *OffRampStorageBuilder) WithLatestPriceSequenceNumber(v uint64) *OffRampStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.LatestPriceSequenceNumber = v
	return b
}

// Build returns the constructed OffRampStorage or an error if any step failed.
func (b *OffRampStorageBuilder) Build() (*OffRampStorage, error) {
	if b.err != nil {
		return nil, b.err
	}
	// copy to avoid future accidental mutation through the builder
	st := b.storage
	return &st, nil
}

func (s *OffRampStorage) FromBinding(raw *offramp.Storage) error {
	b := NewOffRampStorageBuilder().
		WithID(raw.ID).
		WithOwnable(
			raw.Ownable.Owner,
			raw.Ownable.PendingOwner,
		).
		WithFeeQuoter(raw.FeeQuoter).
		WithChainSelector(raw.ChainSelector).
		WithPermissionlessExecutionThresholdSeconds(raw.PermissionlessExecutionThresholdSeconds).
		WithLatestPriceSequenceNumber(raw.LatestPriceSequenceNumber)

	// Deployables
	b = b.WithRMNRouter(raw.Deployables.RMNRouter).
		WithDeployerCode(hex.EncodeToString(raw.Deployables.Deployer.ToBOC())).
		WithMerkleRootCode(hex.EncodeToString(raw.Deployables.MerkleRootCode.ToBOC())).
		WithReceiveExecutorCode(hex.EncodeToString(raw.Deployables.ReceiveExecutorCode.ToBOC()))

	// OCR3Base
	b = b.WithOCR3BaseChainID(int(raw.OCR3Base.ChainID))

	// OCR3Base.Config.Commit
	commit, err := ocr3ConfigToModel(raw.OCR3Base.Commit)
	if err != nil {
		return fmt.Errorf("error while loading OCR3Base.Commit: %w", err)
	}

	// OCR3Base.Config.Execute
	execute, err := ocr3ConfigToModel(raw.OCR3Base.Execute)
	if err != nil {
		return fmt.Errorf("error while loading OCR3Base.Execute: %w", err)
	}

	b = b.WithOCR3CommitConfig(commit).
		WithOCR3ExecuteConfig(execute)

	// CursedSubjects
	cursedSubjects, err := raw.CursedSubjects.LoadAll()
	if err != nil {
		return fmt.Errorf("error while loading CursedSubjects: %w", err)
	}
	for _, kv := range cursedSubjects {
		cursedObject, err2 := kv.Key.LoadBigUInt(128)

		if err2 != nil {
			return fmt.Errorf("error while decoding CursedSubjects: %w", err2)
		}

		b = b.WithCursedSubject(cursedObject)
	}

	sourceChainConfigs, err := raw.SourceChainConfigs.LoadAll()
	if err != nil {
		return fmt.Errorf("error while loading SourceChainConfigs: %w", err)
	}
	for _, scc := range sourceChainConfigs {
		selector, err2 := scc.Key.LoadUInt(64)
		if err2 != nil {
			return fmt.Errorf("error while decoding selector from sourceChainConfig: %w", err2)
		}

		var sourceChainConfig offramp.SourceChainConfig
		if err3 := tlb.LoadFromCell(&sourceChainConfig, scc.Value); err3 != nil {
			return fmt.Errorf("error while decoding transmitter value: %w", err3)
		}

		b = b.WithSourceChainConfig(selector, SourceChainConfig{
			Router:                    sourceChainConfig.Router,
			IsEnabled:                 sourceChainConfig.IsEnabled,
			MinSeqNr:                  sourceChainConfig.MinSeqNr,
			IsRMNVerificationDisabled: sourceChainConfig.IsRMNVerificationDisabled,
			OnRamp:                    hex.EncodeToString(sourceChainConfig.OnRamp),
		})
	}

	built, err := b.Build()
	if err != nil {
		return err
	}

	*s = *built
	return nil
}

func ocr3ConfigToModel(raw *offramp.OCR3Config) (*OCR3Config, error) {
	if raw != nil {
		// OCR3Base.Config.Signers
		signersMap, err := raw.Signers.LoadAll()

		if err != nil {
			return nil, fmt.Errorf("error while loading signers: %w", err)
		}

		var signers []*big.Int
		for _, signerEntry := range signersMap {
			signer, err2 := signerEntry.Key.LoadBigUInt(256)
			if err2 != nil {
				return nil, fmt.Errorf("error while decoding signer: %w", err2)
			}

			signers = append(signers, signer)
		}

		// OCR3Base.Config.Transmitters
		transmittersMap, err := raw.Transmitters.LoadAll()

		if err != nil {
			return nil, fmt.Errorf("error while loading transmitters: %w", err)
		}

		var transmitters []*address.Address
		for _, transmitterEntry := range transmittersMap {
			var transmitter common.AddressWrap
			if err2 := tlb.LoadFromCell(&transmitter, transmitterEntry.Key); err2 != nil {
				return nil, fmt.Errorf("error while decoding transmitter value: %w", err2)
			}

			transmitters = append(transmitters, transmitter.Val)
		}

		wrappedSigners, err := bigIntArrayToHexArray(signers, 32) // 256 bits = 32 bytes
		if err != nil {
			return nil, fmt.Errorf("error while loading transmitters: %w", err)
		}

		commitConfig := OCR3Config{
			ConfigDigest:                   hex.EncodeToString(raw.ConfigInfo.ConfigDigest),
			Signers:                        wrappedSigners,
			Transmitters:                   transmitters,
			F:                              int(raw.ConfigInfo.F),
			N:                              int(raw.ConfigInfo.N),
			IsSignatureVerificationEnabled: raw.ConfigInfo.IsSignatureVerificationEnabled,
		}

		return &commitConfig, nil
	}

	return nil, nil
}

func ocr3ConfigToBinding(config *OCR3Config) (*offramp.OCR3Config, error) {
	if config != nil {
		// OCR3Base.Config.Signers
		signers := cell.NewDict(256)
		for _, rawSigner := range config.Signers {
			signer, err := hexToBigInt(rawSigner)
			if err != nil {
				return nil, fmt.Errorf("error while decoding signer: %w", err)
			}

			if err := signers.Set(
				cell.BeginCell().MustStoreBigUInt(signer, 256).EndCell(),
				tvm.EmptyCell,
			); err != nil {
				return nil, fmt.Errorf("error while setting signers: %w", err)
			}
		}

		// OCR3Base.Config.Transmitters
		transmitters := cell.NewDict(267)
		for _, transmitter := range config.Transmitters {
			if err := transmitters.Set(
				cell.BeginCell().MustStoreAddr(transmitter).EndCell(),
				tvm.EmptyCell,
			); err != nil {
				return nil, fmt.Errorf("error while setting transmitters: %w", err)
			}
		}

		if config.F < 0 || config.F > math.MaxUint8 {
			return nil, fmt.Errorf("f in ocr3base %d overflows or underflows uint8", config.F)
		}
		fU8 := uint8(config.F)

		if config.N < 0 || config.N > math.MaxUint8 {
			return nil, fmt.Errorf("n in ocr3base %d overflows or underflows uint8", config.N)
		}
		nU8 := uint8(config.N)

		configDigest, err := hex.DecodeString(config.ConfigDigest)
		if err != nil {
			return nil, fmt.Errorf("error while decoding configDigest: %w", err)
		}

		return &offramp.OCR3Config{
			Signers:      signers,
			Transmitters: transmitters,
			ConfigInfo: offramp.ConfigInfo{
				ConfigDigest:                   configDigest,
				F:                              fU8,
				N:                              nU8,
				IsSignatureVerificationEnabled: config.IsSignatureVerificationEnabled,
			},
		}, nil
	}

	return nil, nil
}

func (s *OffRampStorage) ToBinding() (*offramp.Storage, error) {
	deployerCode, err := loadCell(s.Deployables.Deployer)
	if err != nil {
		return nil, fmt.Errorf("error while loading deployer code: %w", err)
	}

	merkleRootCode, err := loadCell(s.Deployables.MerkleRootCode)
	if err != nil {
		return nil, fmt.Errorf("error while loading merkle root code: %w", err)
	}

	receiveExecutorCode, err := loadCell(s.Deployables.ReceiveExecutorCode)
	if err != nil {
		return nil, fmt.Errorf("error while loading receive executor code: %w", err)
	}

	commitOCR3Config, err := ocr3ConfigToBinding(s.OCR3Base.Commit)
	if err != nil {
		return nil, fmt.Errorf("error while loading commit OCR3 config: %w", err)
	}

	executeOCR3Config, err := ocr3ConfigToBinding(s.OCR3Base.Execute)
	if err != nil {
		return nil, fmt.Errorf("error while loading execute OCR3 config: %w", err)
	}

	if s.OCR3Base.ChainID < 0 || s.OCR3Base.ChainID > math.MaxUint8 {
		return nil, fmt.Errorf("ChainID in OCR3Base %d overflows or underflows uint8", s.OCR3Base.ChainID)
	}

	// RMNRemote.CursedObjects
	cursedSubjects := cell.NewDict(128)
	for _, co := range s.CursedSubjects {
		if err := cursedSubjects.Set(
			cell.BeginCell().MustStoreBigUInt(co, 128).EndCell(),
			tvm.EmptyCell,
		); err != nil {
			return nil, fmt.Errorf("error while setting CursedSubjects: %w", err)
		}
	}

	// SourceChainConfigs
	sourceChainConfigs := cell.NewDict(64)
	for chainSelector, scc := range s.SourceChainConfigs {
		onRamp, err2 := hex.DecodeString(scc.OnRamp)
		if err2 != nil {
			return nil, fmt.Errorf("error while decoding onRamp on sourceChainConfig: %w", err2)
		}

		sourceChainConfig := offramp.SourceChainConfig{
			Router:                    scc.Router,
			IsEnabled:                 scc.IsEnabled,
			MinSeqNr:                  scc.MinSeqNr,
			IsRMNVerificationDisabled: scc.IsRMNVerificationDisabled,
			OnRamp:                    onRamp,
		}

		sourceChainConfigCell, err3 := tlb.ToCell(sourceChainConfig)
		if err3 != nil {
			return nil, fmt.Errorf("error while encoding sourceChainConfig as cell: %w", err3)
		}

		if err4 := sourceChainConfigs.Set(
			cell.BeginCell().MustStoreUInt(chainSelector, 64).EndCell(),
			sourceChainConfigCell,
		); err4 != nil {
			return nil, fmt.Errorf("error while setting sourceChainConfigs: %w", err4)
		}
	}

	chainID := s.OCR3Base.ChainID
	if chainID < 0 || chainID > math.MaxUint8 {
		return nil, fmt.Errorf("chainID in ocr3base %d overflows or underflows uint8", chainID)
	}
	chainIDU8 := uint8(chainID)

	st := offramp.Storage{
		ID: s.ID,
		Ownable: ownable2step.Storage{
			Owner:        s.Ownable.Owner,
			PendingOwner: s.Ownable.PendingOwner,
		},
		FeeQuoter:                               s.FeeQuoter,
		ChainSelector:                           s.ChainSelector,
		PermissionlessExecutionThresholdSeconds: s.PermissionlessExecutionThresholdSeconds,
		LatestPriceSequenceNumber:               s.LatestPriceSequenceNumber,
		Deployables: offramp.Deployables{
			RMNRouter:           s.Deployables.RMNRouter,
			Deployer:            deployerCode,
			MerkleRootCode:      merkleRootCode,
			ReceiveExecutorCode: receiveExecutorCode,
		},
		OCR3Base: offramp.OCR3Base{
			ChainID: chainIDU8,
			Commit:  commitOCR3Config,
			Execute: executeOCR3Config,
		},
		CursedSubjects:     cursedSubjects,
		SourceChainConfigs: sourceChainConfigs,
	}

	return &st, nil
}
