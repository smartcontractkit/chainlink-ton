package changesets

import (
	"fmt"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"
)

type FundContractInput struct {
	// The TON contract address to transfer funds to
	DestinationAddress string `json:"destinationAddress"` // TODO make a list instead?
	// Amount to transfer (in TON)
	Amount string `json:"amount"`
	// Chain selector for the TON chain
	ChainSelector uint64 `json:"chainSelector"`
}

func FundContractChangeset() cldf.ChangeSetV2[FundContractInput] {
	return cldf.CreateChangeSet(applyFundContract, verifyFundContractInput)
}

func verifyFundContractInput(env cldf.Environment, input FundContractInput) error {
	switch input.ChainSelector {
	case chainsel.TON_TESTNET.Selector, chainsel.TON_MAINNET.Selector, chainsel.TON_LOCALNET.Selector:
		// valid selectors
	default:
		return fmt.Errorf("unsupported chain selector for TON chain: %d", input.ChainSelector)
	}
	_, err := tlb.FromTON(input.Amount)
	if err != nil {
		return fmt.Errorf("failed to parse amount: %w", err)
	}
	dest, err := address.ParseAddr(input.DestinationAddress)
	if err != nil {
		return fmt.Errorf("failed to parse destination address: %w", err)
	}

	tonContracts := env.DataStore.Addresses().Filter(func(ar []datastore.AddressRef) []datastore.AddressRef {
		tonContracts := make([]datastore.AddressRef, 0)
		for _, a := range ar {
			if a.ChainSelector == input.ChainSelector {
				switch a.Type {
				case state.OffRamp, state.OnRamp, state.Router, state.FeeQuoter:
					tonContracts = append(tonContracts, a)
				default:
					continue
				}
			}
		}
		return tonContracts
	})
	// check if input.DestinationAddress is in tonContracts
	found, err := func() (bool, error) {

		for _, a := range tonContracts {
			addr, err := address.ParseAddr(a.Address)
			if err != nil {
				return false, fmt.Errorf("failed to parse address from datastore: %w", err)
			}
			if addr.Equals(dest) {
				return true, nil
			}
		}
		return false, nil
	}()
	if err != nil {
		return fmt.Errorf("error checking destination address in datastore: %w", err)
	}
	if !found {
		return fmt.Errorf("destination address %s not found in datastore for chain selector %d. Transfer not allowed", dest.String(), input.ChainSelector)
	}

	return nil
}

func applyFundContract(env deployment.Environment, input FundContractInput) (deployment.ChangesetOutput, error) {
	// Input has already been validated by verifyFundContractInput
	dest := address.MustParseAddr(input.DestinationAddress)
	amount := tlb.MustFromTON(input.Amount)

	// TODO: We could get contract balance and transfer the difference instead of the full amount

	// Transfer funds from deployer wallet
	// Get the TON chain
	tonChains := env.BlockChains.TonChains()
	chain, ok := tonChains[uint64(input.ChainSelector)]
	if !ok {
		return deployment.ChangesetOutput{}, fmt.Errorf("TON chain not found for selector %d", input.ChainSelector)
	}

	// Build the transfer message
	transfer, err := chain.Wallet.BuildTransfer(dest, amount, false, "")
	if err != nil {
		return deployment.ChangesetOutput{}, fmt.Errorf("failed to build transfer: %w", err)
	}

	// Send the transaction
	c := tracetracking.NewSignedAPIClient(chain.Client, *chain.Wallet)

	msg, err := c.SendAndWaitForTrace(env.GetContext(), *dest, transfer)
	if err != nil {
		return deployment.ChangesetOutput{}, fmt.Errorf("failed to send funds: %w", err)
	}

	if msg.ExternalMsg == nil {
		return deployment.ChangesetOutput{}, fmt.Errorf("no external message found in the transaction trace")
	}
	if !msg.ExternalMsg.DstAddr.Equals(c.Wallet.WalletAddress()) {
		return deployment.ChangesetOutput{}, fmt.Errorf("transaction destination mismatch: expected %s, got %s", dest.String(), msg.ExternalMsg.DstAddr.String())
	}
	ec, err := msg.ExitCode()
	if err != nil {
		return deployment.ChangesetOutput{}, fmt.Errorf("failed to get exit code from transaction trace: %w", err)
	}
	if ec != 0 {
		return deployment.ChangesetOutput{}, fmt.Errorf("transaction execution failed with exit code %d", ec)
	}
	if len(msg.OutgoingInternalReceivedMessages) == 0 || msg.OutgoingInternalReceivedMessages[0] == nil {
		return deployment.ChangesetOutput{}, fmt.Errorf("no outgoing internal messages found in the transaction trace")
	}
	inMsg := msg.OutgoingInternalReceivedMessages[0]
	if inMsg.InternalMsg == nil {
		return deployment.ChangesetOutput{}, fmt.Errorf("no internal message found in the transaction trace")
	}
	if !inMsg.InternalMsg.DstAddr.Equals(dest) {
		return deployment.ChangesetOutput{}, fmt.Errorf("transaction destination mismatch: expected %s, got %s", dest.String(), inMsg.InternalMsg.DstAddr.String())
	}
	if inMsg.InternalMsg.Bounced {
		return deployment.ChangesetOutput{}, fmt.Errorf("transaction bounced back to sender")
	}

	env.Logger.Infow("Funds transferred successfully",
		"from", chain.WalletAddress.String(),
		"to", dest.String(),
		"amount", input.Amount)

	return deployment.ChangesetOutput{}, nil
}
