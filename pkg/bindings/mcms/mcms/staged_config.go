package mcms

import (
	"errors"
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
)

// StagedConfigMessages contains the ordered messages for a staged config update.
type StagedConfigMessages struct {
	Begin  BeginConfigStaging
	Stages []StageConfig
	Commit CommitConfig
}

// BuildStagedConfigMessages splits ordered signers into begin/stage/commit messages.
// The caller is responsible for deriving signer order, groups, and quorum maps from
// the MCMS config. Signer chunks are limited to chunkSize.
func BuildStagedConfigMessages(
	groupQuorums [32]uint8,
	groupParents [32]uint8,
	signerAddresses []SignerAddress,
	signerGroups []SignerGroup,
	queryID uint64,
	clearRoot bool,
	chunkSize int,
) (StagedConfigMessages, error) {
	if len(signerAddresses) == 0 {
		return StagedConfigMessages{}, errors.New("config must contain at least one signer")
	}
	if len(signerAddresses) != len(signerGroups) {
		return StagedConfigMessages{}, errors.New("signer addresses and groups length mismatch")
	}
	if chunkSize <= 0 {
		return StagedConfigMessages{}, errors.New("chunk size must be greater than zero")
	}

	gqDict, err := tlbe.NewDictFromSlice[uint8](groupQuorums[:])
	if err != nil {
		return StagedConfigMessages{}, fmt.Errorf("failed to create group quorums dict: %w", err)
	}
	gpDict, err := tlbe.NewDictFromSlice[uint8](groupParents[:])
	if err != nil {
		return StagedConfigMessages{}, fmt.Errorf("failed to create group parents dict: %w", err)
	}

	messages := StagedConfigMessages{
		Begin: BeginConfigStaging{
			QueryID:      queryID,
			GroupQuorums: gqDict,
			GroupParents: gpDict,
		},
		Commit: CommitConfig{
			QueryID:            queryID,
			ExpectedNumSigners: uint16(len(signerAddresses)), //nolint:gosec // caller bounds config size
			ClearRoot:          clearRoot,
		},
	}
	for offset := 0; offset < len(signerAddresses); offset += chunkSize {
		end := offset + chunkSize
		if end > len(signerAddresses) {
			end = len(signerAddresses)
		}
		messages.Stages = append(messages.Stages, StageConfig{
			QueryID:            queryID,
			ExpectedNumSigners: uint16(offset), //nolint:gosec // caller bounds config size
			SignerAddresses:    signerAddresses[offset:end],
			SignerGroups:       signerGroups[offset:end],
		})
	}

	return messages, nil
}
