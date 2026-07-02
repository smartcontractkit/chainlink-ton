package inspector

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"go.uber.org/zap/zapcore"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/model"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/explorer"
)

const (
	contractTypeFeeQuoter  = "FeeQuoter"
	contractTypeRouter     = "Router"
	contractTypeMerkleRoot = "MerkleRoot"
	contractTypeOffRamp    = "OffRamp"
	contractTypeOnRamp     = "OnRamp"
)

func GenerateInspectorCmd(lggr *logger.Logger, client *ton.APIClient) *cobra.Command {
	var (
		contractAddress string
		contractType    string
		net             string
		verbose         bool
	)

	cmd := &cobra.Command{
		Use:   "inspector <contractAddress>",
		Short: "TON blockchain contract data inspector",
		Long: `A command-line tool for inspecting CCIP TON contract storage.

Usage:
  inspector <contractAddress>  - Inspect the CCIP TON contract storage

Arguments:
  contractAddress   CCIP TON contract address in base64`,
		Args: func(cmd *cobra.Command, args []string) error {
			if len(args) != 1 {
				return errors.New("requires 1 argument (<contractAddress>)")
			}
			return nil
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			var (
				log logger.Logger
				err error
			)

			// Prefer provided logger
			if lggr != nil {
				log = *lggr
			} else {
				cfg := logger.Config{}
				if verbose {
					cfg.Level = zapcore.DebugLevel
				}
				log, err = cfg.New()
				if err != nil {
					return fmt.Errorf("failed to create logger: %w", err)
				}
			}

			if client != nil && cmd.Flags().Changed("net") {
				return errors.New("cannot specify --net when supplying existing client")
			}

			contractAddress = args[0]

			ctx := context.Background()
			connection, err := explorer.TONConnect(log, client, net, verbose, 0, 0)
			if err != nil {
				return fmt.Errorf("failed to initialize inspector: %w", err)
			}

			if _, err := readStorage(ctx, log, connection, contractAddress, contractType); err != nil {
				return fmt.Errorf("failed to read contract storage: %w", err)
			}

			return nil
		},
	}

	cmd.Flags().StringVarP(&contractType, "contractType", "t", "", "Contract type (FeeQuoter, Router, MerkleRoot, OffRamp)")
	cmd.Flags().StringVarP(&net, "net", "n", "testnet", "TON network (mainnet, testnet, mylocalton, or http://domain/x.global.config.json)")
	if lggr == nil {
		cmd.Flags().BoolVarP(&verbose, "verbose", "v", false, "Enable debug logs")
	}

	return cmd
}

func readStorage(
	ctx context.Context,
	lggr logger.Logger,
	connection *ton.APIClient,
	contractAddress string,
	contractType string,
) ([]byte, error) {
	lggr.Infof("Trying to decode storage for address %s with contract type %s", contractAddress, contractType)

	addr, err := address.ParseAddr(contractAddress)
	if err != nil {
		return nil, fmt.Errorf("invalid contract address %q: %w", contractAddress, err)
	}

	block, err := connection.GetMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("get masterchain info: %w", err)
	}

	account, err := connection.WaitForBlock(block.SeqNo).GetAccount(ctx, block, addr)
	if err != nil {
		return nil, fmt.Errorf("get account: %w", err)
	}

	cell := account.Data
	if cell == nil {
		return nil, errors.New("account has no data")
	}

	boc := cell.ToBOC()
	dataHex := hex.EncodeToString(boc)

	lggr.Infof("Data found with hash %s", hex.EncodeToString(cell.Hash()))

	// Final decoded storage
	var storage any

	switch contractType {
	case contractTypeFeeQuoter:
		target := &model.FeeQuoterStorage{}
		if err = model.FromBindingDataHex(target, dataHex); err != nil {
			lggr.Errorf("Failed to decode FeeQuoter storage: %v", err)
			return nil, fmt.Errorf("unable to decode FeeQuoter storage: %w", err)
		}
		storage = target

	case contractTypeRouter:
		target := &model.RouterStorage{}
		if err = model.FromBindingDataHex(target, dataHex); err != nil {
			lggr.Errorf("Failed to decode Router storage: %v", err)
			return nil, fmt.Errorf("unable to decode Router storage: %w", err)
		}
		storage = target

	case contractTypeMerkleRoot:
		target := &model.MerkleRootStorage{}
		if err = model.FromBindingDataHex(target, dataHex); err != nil {
			lggr.Errorf("Failed to decode MerkleRoot storage: %v", err)
			return nil, fmt.Errorf("unable to decode MerkleRoot storage: %w", err)
		}
		storage = target

	case contractTypeOffRamp:
		target := &model.OffRampStorage{}
		if err = model.FromBindingDataHex(target, dataHex); err != nil {
			lggr.Errorf("Failed to decode OffRamp storage: %v", err)
			return nil, fmt.Errorf("unable to decode OffRamp storage: %w", err)
		}
		storage = target

	case contractTypeOnRamp:
		target := &model.OnRampStorage{}
		if err = model.FromBindingDataHex(target, dataHex); err != nil {
			lggr.Errorf("Failed to decode OnRamp storage: %v", err)
			return nil, fmt.Errorf("unable to decode OnRamp storage: %w", err)
		}
		storage = target
	default:
		return nil, fmt.Errorf("unsupported contract type: %v", contractType)
	}

	// Marshal compact JSON
	storageJSON, err := json.Marshal(storage)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal storage: %w", err)
	}

	// DO NOT CHANGE THIS — as you requested
	lggr.Infow("Contract storage", "json", storage)

	return storageJSON, nil
}
