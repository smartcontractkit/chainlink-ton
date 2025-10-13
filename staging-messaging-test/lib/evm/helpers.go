package evm

import (
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/message_hasher"
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/onramp"
)

// formatETH formats wei to ETH with 6 decimal places
func formatETH(wei *big.Int) string {
	eth := new(big.Float).Quo(new(big.Float).SetInt(wei), big.NewFloat(1e18))
	return eth.Text('f', 6)
}

// buildEVMExtraArgsV2 manually builds the CCIP extra args V2 bytes
// Format: 0x181dcf10 (version tag) + ABI-encoded(gasLimit, allowOutOfOrderExecution)
func buildEVMExtraArgsV2(extraArgs message_hasher.ClientGenericExtraArgsV2) ([]byte, error) {
	// V2 version tag
	versionTag := []byte{0x18, 0x1d, 0xcf, 0x10}

	// Define the types for ABI encoding: (uint256, bool)
	uint256Type, err := abi.NewType("uint256", "", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create uint256 type: %w", err)
	}

	boolType, err := abi.NewType("bool", "", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create bool type: %w", err)
	}

	// Create arguments
	arguments := abi.Arguments{
		{Type: uint256Type},
		{Type: boolType},
	}

	// Pack the arguments
	packed, err := arguments.Pack(extraArgs.GasLimit, extraArgs.AllowOutOfOrderExecution)
	if err != nil {
		return nil, fmt.Errorf("failed to pack extra args: %w", err)
	}

	// Combine version tag + packed data
	result := make([]byte, len(versionTag)+len(packed))
	copy(result, versionTag)
	copy(result[len(versionTag):], packed)
	return result, nil
}

// extractFromCCIPMessageSent extracts sequence number and messageID from CCIPMessageSent event
func extractFromCCIPMessageSent(receipt *types.Receipt) (uint64, string, error) {
	parsedABI, err := abi.JSON(strings.NewReader(OnRampABI))
	if err != nil {
		return 0, "", fmt.Errorf("failed to parse OnRamp ABI: %w", err)
	}

	event, ok := parsedABI.Events["CCIPMessageSent"]
	if !ok {
		return 0, "", errors.New("CCIPMessageSent event not found in ABI")
	}

	for _, log := range receipt.Logs {
		if len(log.Topics) == 0 || log.Topics[0] != event.ID {
			continue
		}

		var eventData onramp.OnRampCCIPMessageSent
		if err := parsedABI.UnpackIntoInterface(&eventData, "CCIPMessageSent", log.Data); err != nil {
			continue
		}

		messageID := hex.EncodeToString(eventData.Message.Header.MessageId[:])
		return eventData.SequenceNumber, messageID, nil
	}

	return 0, "", errors.New("CCIPMessageSent event not found in receipt")
}
