package mcms // alias: opsmcms

import (
	"fmt"
	"math"
	"strconv"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	chainsel "github.com/smartcontractkit/chain-selectors"
	mcmstypes "github.com/smartcontractkit/mcms/types"

	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	ccipddeploy "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	ccipdutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	ccipdseq "github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	opsutils "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/operation"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
)

const (
	DefaultMinDelay              = 1 * 60 * 60 // 1 hour in seconds
	DefaultOpFinalizationTimeout = 30          // 30 seconds

	// DefaultDeployValueTON is the default amount of TON coins to allocate for MCMS/Timelock contract deployment.
	// MCMS contracts require more storage and operational capacity, hence the higher allocation compared to CCIP contracts.
	DefaultDeployValueTON = "1.5" // TON
)

type DeployMCMSSeqInput struct {
	Config ccipddeploy.MCMSDeploymentConfigPerChain `json:"config"`

	// Extra TON specific params
	Value                 *tlb.Coins `json:"value"`                 // value to send with deployment, optional, if not provided, defaults to 1.5 TON
	ContractID            uint32     `json:"contractID"`            // ID (storage data) to use for the deployed contracts, can be used to derive the address pre-deployment.
	OpFinalizationTimeout uint32     `json:"opFinalizationTimeout"` // optional, if not provided, defaults to 30 seconds
	// Extra Timelock params
	// Notice: in.Config.TimelockAdmin is of EVM type common.Address (20 bytes),
	// which is not compatible with TON address, so we have a separate field for TON address type.
	TimelockAdmin                    *address.Address `json:"timelockAdmin"`                    // optional, if not provided, deployer address will be used as initial admin
	TimelockExecutorRoleCheckEnabled bool             `json:"timelockExecutorRoleCheckEnabled"` // optional, if not provided, defaults to false (TON does not have a CallProxy, so we disable executor role check by default)
}

var DeployMCMSSequence = cldfops.NewSequence(
	"ton/sequences/mcms/deploy-mcms-suite",
	semver.MustParse("0.1.0"),
	"Deploys MCMS suite (MCMS/Proposer, MCMS/Canceller, MCMS/Bypasser, Timelock) with the provided config",
	deployMCMSSequence,
)

func deployMCMSSequence(b cldfops.Bundle, dp *dep.DependencyProvider, in DeployMCMSSeqInput) (ccipdseq.OnChainOutput, error) {
	chain, err := dep.Resolve[cldfton.Chain](dp)
	if err != nil {
		return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to resolve chain: %w", err)
	}

	selector := chain.ChainSelector()
	chainIDStr, err := chainsel.GetChainIDFromSelector(selector)
	if err != nil {
		return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to get chainID from selector %d: %w", selector, err)
	}

	chainID, err := strconv.ParseInt(chainIDStr, 10, 64)
	if err != nil {
		return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to parse chainID: %w", err)
	}

	qualifier := ccipdutils.CLLQualifier // default
	if in.Config.Qualifier != nil {
		qualifier = *in.Config.Qualifier
	}

	stateMCMS, err := dep.Resolve[state.MCMSChainState](dp)
	if err != nil {
		return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to resolve ton mcms state: %w", err)
	}
	// Get MCMS state by qualifier to check if any of the contracts are already deployed (and avoid redeploying them)
	stateMCMSSuite := stateMCMS.ByQualifier[qualifier]
	if stateMCMSSuite == nil {
		none := address.NewAddressNone()
		stateMCMSSuite = &state.MCMSSuiteState{
			Proposer:  none,
			Bypasser:  none,
			Canceller: none,
			Timelock:  none,
		}
	}

	addresses := make([]cldfds.AddressRef, 0) // deployed contract addresses to return in output

	// Notice: we set a (static) default when version is not provided (e.g., common 'deploy_mcms_for_cll' changeset)
	contractsPackage := utils.ContractsPackageLatestSupported
	if in.Config.ContractVersion != "" {
		contractsPackage = in.Config.ContractVersion
	}

	retrieveContractsInput := utils.RetrieveCompiledContractsOpts{
		Package: contractsPackage,
		Contracts: []tvm.FullyQualifiedName{
			bindings.TypeTimelock,
			bindings.TypeMCMS,
		},
	}

	compiledContracts, err := utils.RetrieveCompiledTONContracts(b.GetContext(), b.Logger, &retrieveContractsInput)
	if err != nil {
		return ccipdseq.OnChainOutput{}, err
	}

	// TODO: fix type as tlb.Coins vs. string
	value := tlb.MustFromTON(DefaultDeployValueTON)
	if in.Value != nil {
		value = *in.Value
	}

	// Notice: we increment the id for each deployment to avoid address collision
	id := in.ContractID

	opFinalizationTimeout := uint32(DefaultOpFinalizationTimeout) // default to 30 seconds
	if in.OpFinalizationTimeout != 0 {
		opFinalizationTimeout = in.OpFinalizationTimeout
	}

	// Helper function to deploy a MCMS contract with the given config and return the deployed address
	deployAndSetConfig := func(config *mcmstypes.Config, contractType cldfds.ContractType) (*cldfds.AddressRef, error) {
		storage := mcms.EmptyDataFrom(id, chain.WalletAddress, chainID)
		storage.RootInfo.ExpiringRootAndOpCount.OpPendingInfo.OpFinalizationTimeout = opFinalizationTimeout

		// Notice: we use a unique seriesID for the setConfig operations to ensure that the reports are correctly matched to each execution,
		// otherwise we can skip execution (matching report) when executing same input multiple times.
		// Not critical here as we only plan, but set as an example.
		seriesID := strconv.FormatUint(uint64(id), 10)
		out, err := opsutils.ExecuteOperation(b, SetConfig, dp, SetConfigInput{
			Bounce:  false,
			DstAddr: tvm.ZeroAddress,      // placeholder, actual address is determined by the deployment and not known at this point
			Amount:  tlb.MustFromTON("0"), // placeholder, we just plan here

			// Params for setConfig message body
			Config:    config,
			ClearRoot: false,

			Plan: true, // we just want to plan the setConfig message to get the body for deployment
		}, seriesID)
		if err != nil {
			return nil, fmt.Errorf("failed to send messages: %w", err)
		}

		// Extract the body from the full message plan to use it for deployment
		msg, err := out.Output.Plans[0].Cell.ToValue()
		if err != nil {
			return nil, fmt.Errorf("failed to convert plan cell to value: %w", err)
		}
		body := msg.Body

		// Notice: storage.id acts as a series ID and makes the input unique per deployment
		outputAddr, err := operation.InvokeDeployContractOperation(b, dp, selector, compiledContracts[bindings.TypeMCMS], storage, body, value.String())
		if err != nil {
			return nil, fmt.Errorf("failed to deploy MCMS contract of type %s: %w", contractType, err)
		}

		// TODO (fix, improve above deployment op):
		// Override (output) addr type with specific MCMS deployment type
		outputAddr.Type = contractType
		b.Logger.Infof("Deployed MCMS type %s at address %s on chain %s", outputAddr.Type, outputAddr.Address, chain.Name)

		// Notice: we fund MCMS contract with a separate (empty) message as setConfig will return excess to sender
		outputAddrTON, err := utils.ToTONAddress(*outputAddr)
		if err != nil {
			return nil, fmt.Errorf("failed to convert output address to TON format: %w", err)
		}

		mcell, err := tlbe.NewCellFrom(tlb.InternalMessage{
			Bounce:  true,
			DstAddr: outputAddrTON,
			Amount:  value, // attach the same value as deployment
			Body:    nil,   // empty body for funding message
		})
		if err != nil {
			return nil, fmt.Errorf("failed to create message cell: %w", err)
		}

		msgs := []*tlbe.Cell[tlb.InternalMessage]{mcell}
		_, err = cldfops.ExecuteOperation(b, opston.SendMessagesRaw, dp, opston.SendMessagesRawInput{Messages: msgs})
		if err != nil {
			return nil, fmt.Errorf("failed to send MCMS funding message: %w", err)
		}

		return outputAddr, nil
	}

	// #0 - deploy MCMS - proposer role
	if stateMCMSSuite.Proposer == nil || stateMCMSSuite.Proposer.IsAddrNone() { // Deploy MCMS only if not deployed yet
		t := cldfds.ContractType(ccipdutils.ProposerManyChainMultisig)
		addr, err := deployAndSetConfig(&in.Config.Proposer, t)
		if err != nil {
			return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to deploy proposer MCMS: %w", err)
		}

		addresses = append(addresses, *addr)
		stateMCMSSuite.Proposer, err = utils.ToTONAddress(*addr)
		if err != nil {
			return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to convert proposer address: %w", err)
		}

		id++ // increment ID for the next contract to avoid address collision
	}

	// #1 - deploy MCMS - canceller role
	if stateMCMSSuite.Canceller == nil || stateMCMSSuite.Canceller.IsAddrNone() { // Deploy MCMS only if not deployed yet
		t := cldfds.ContractType(ccipdutils.CancellerManyChainMultisig)
		addr, err := deployAndSetConfig(&in.Config.Canceller, t)
		if err != nil {
			return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to deploy canceller MCMS: %w", err)
		}

		addresses = append(addresses, *addr)
		stateMCMSSuite.Canceller, err = utils.ToTONAddress(*addr)
		if err != nil {
			return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to convert canceller address: %w", err)
		}
		id++ // increment ID for the next contract to avoid address collision
	}

	// #2 - deploy MCMS - bypasser role
	if stateMCMSSuite.Bypasser == nil || stateMCMSSuite.Bypasser.IsAddrNone() { // Deploy MCMS only if not deployed yet
		t := cldfds.ContractType(ccipdutils.BypasserManyChainMultisig)
		addr, err := deployAndSetConfig(&in.Config.Bypasser, t)
		if err != nil {
			return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to deploy bypasser MCMS: %w", err)
		}

		addresses = append(addresses, *addr)
		stateMCMSSuite.Bypasser, err = utils.ToTONAddress(*addr)
		if err != nil {
			return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to convert bypasser address: %w", err)
		}
		id++ // increment ID for the next contract to avoid address collision
	}

	// #3 - deploy Timelock
	if stateMCMSSuite.Timelock == nil || stateMCMSSuite.Timelock.IsAddrNone() { // Deploy Timelock only if not deployed yet
		storage := timelock.EmptyDataFrom(id)

		// MinDelay from cfg.TimelockMinDelay (big.Int) to uint32 safely
		minDelay := uint32(DefaultMinDelay)
		if in.Config.TimelockMinDelay != nil && in.Config.TimelockMinDelay.IsUint64() {
			val := in.Config.TimelockMinDelay.Uint64()
			if val <= math.MaxUint32 {
				minDelay = uint32(val)
			} else {
				// overflow, set to max
				minDelay = math.MaxUint32
			}
		}

		// Set deployer as default admin, unless TimelockAdmin is provided in input
		admin := chain.WalletAddress
		if in.TimelockAdmin != nil {
			admin = in.TimelockAdmin
		}

		qID, err := tvm.RandomQueryID()
		if err != nil {
			return ccipdseq.OnChainOutput{}, fmt.Errorf("failed to generate random query ID: %w", err)
		}

		// Notice: no need to separately fund Timelock contract as the attached Init doesn't return excess to sender
		body := timelock.Init{
			QueryID:  qID,
			MinDelay: minDelay,
			Admin:    admin,

			Proposers:  []common.AddressWrap{{Val: stateMCMSSuite.Proposer}},
			Cancellers: []common.AddressWrap{{Val: stateMCMSSuite.Canceller}},
			Bypassers:  []common.AddressWrap{{Val: stateMCMSSuite.Bypasser}},
			// Notice: no executors set, executor role check disabled

			// disable executor role check to allow anyone to execute (TON does not have a CallProxy)
			ExecutorRoleCheckEnabled: in.TimelockExecutorRoleCheckEnabled,
			OpFinalizationTimeout:    opFinalizationTimeout, // 30 seconds default, can be updated later
		}

		outputAddr, err := operation.InvokeDeployContractOperation(b, dp, selector, compiledContracts[bindings.TypeTimelock], storage, body, value.String())
		if err != nil {
			return ccipdseq.OnChainOutput{}, err
		}
		addresses = append(addresses, *outputAddr)
		id++ // increment ID for the next contract to avoid address collision
		b.Logger.Infof("Deployed Timelock at address %s on chain %s", outputAddr.Address, chain.Name)
	}

	// Attach the metadata (qualifier and labels) to the output (to be stored in DS)
	for i := range addresses {
		addresses[i].Qualifier = qualifier

		labels := []string{fmt.Sprintf("sha:%v", in.Config.ContractVersion)}
		if in.Config.Label != nil {
			labels = append(labels, *in.Config.Label)
		}
		addresses[i].Labels = cldfds.NewLabelSet(labels...)
	}

	return ccipdseq.OnChainOutput{
		Addresses: addresses,
	}, nil
}
