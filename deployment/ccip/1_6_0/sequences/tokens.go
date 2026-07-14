package sequences

import (
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf_chain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	tokensapi "github.com/smartcontractkit/chainlink-ccip/deployment/tokens"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/operation"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	jettoncommon "github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/minter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenregistry"
	ccipcodec "github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	ton_tvm "github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

const (
	// defaultJettonDeployCoin is the value (TON) sent with a jetton minter deployment.
	defaultJettonDeployCoin = "1.0"

	// defaultJettonContentURI mirrors the value used by the existing jetton integration helper.
	defaultJettonContentURI = "smartcontract.com"

	// defaultJettonDecimals is returned by DeriveTokenDecimals until the on-chain getter is wired up.
	// TON jettons commonly use 9 decimas.
	defaultJettonDecimals uint8 = 9
)

// TonTokenAdapter implements tokensapi.TokenAdapter for TON at CCIP v1.6.0.
// It currently supports deploying jetton minters and the test token pool used by
// the minimal token-transfer smoke path.
type TonTokenAdapter struct {
	Package string // Used to retrieve compiled contracts for deployment sequences. Defaults to utils.ContractsVersionLocal if empty.
}

var _ tokensapi.TokenAdapter = (*TonTokenAdapter)(nil)

// NewTonTokenAdapter constructs the TON token adapter.
func NewTonTokenAdapter() *TonTokenAdapter {
	return &TonTokenAdapter{}
}

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

func (a *TonTokenAdapter) AddressRefToBytes(ref datastore.AddressRef) ([]byte, error) {
	if ref.Address == "" {
		return nil, errors.New("empty address in ref")
	}
	addrCodec := ccipcodec.NewAddressCodec()
	raw, err := addrCodec.AddressStringToBytes(ref.Address)
	if err != nil {
		return nil, fmt.Errorf("failed to convert TON address %q to bytes: %w", ref.Address, err)
	}
	return raw, nil
}

// DeriveTokenAddress looks up the deployed jetton minter that shares the pool's qualifier.
// Convention: the DeployTokenInput.Qualifier and DeployTokenPoolInput.TokenPoolQualifier
// match (e.g. both "TEST_TOKEN_USDC"); this lets us resolve the token from the pool ref.
// TODO: This should probably read the Token address from the pool on-chain: smartcontractkit/chainlink-ccip@a58c4ba/deployment/docs/implementing-adapters.md?plain=1#L157
// For now we can keep it like this and modify it when the actul TokenPools are integrated
func (a *TonTokenAdapter) DeriveTokenAddress(e cldf.Environment, chainSelector uint64, poolRef datastore.AddressRef) (string, error) {
	candidates := e.DataStore.Addresses().Filter(
		datastore.AddressRefByChainSelector(chainSelector),
		datastore.AddressRefByType(datastore.ContractType(bindings.ShortJettonMinter)),
		datastore.AddressRefByQualifier(poolRef.Qualifier),
	)
	switch len(candidates) {
	case 0:
		return "", fmt.Errorf("no jetton minter found in datastore for chain %d and qualifier %q", chainSelector, poolRef.Qualifier)
	case 1:
		return candidates[0].Address, nil
	default:
		return "", fmt.Errorf("multiple jetton minters found in datastore for chain %d and qualifier %q", chainSelector, poolRef.Qualifier)
	}
}

// DeriveTokenDecimals returns the decimals for the jetton at `token`.
// TODO: replace with an on-chain get_jetton_data call once a typed getter binding is available.
func (a *TonTokenAdapter) DeriveTokenDecimals(e cldf.Environment, chainSelector uint64, poolRef datastore.AddressRef, token []byte) (uint8, error) {
	return defaultJettonDecimals, nil
}

// DeriveTokenPoolCounterpart is the identity for TON: the pool address IS the deployed
// address (no PDA derivation like Solana).
func (a *TonTokenAdapter) DeriveTokenPoolCounterpart(e cldf.Environment, chainSelector uint64, tokenPool []byte, token []byte) ([]byte, error) {
	return tokenPool, nil
}

// DeployTokenVerify currently performs no validation.
func (a *TonTokenAdapter) DeployTokenVerify(e cldf.Environment, in tokensapi.DeployTokenInput) error {
	return nil
}

// ---------------------------------------------------------------------------
// Write-side sequences
// ---------------------------------------------------------------------------

// DeployToken deploys a jetton (TEP-74 minter + wallet code) on TON.
func (a *TonTokenAdapter) DeployToken() *cldf_ops.Sequence[tokensapi.DeployTokenInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/deploy-token",
		semver.MustParse("1.6.0"),
		"Deploys a jetton (minter + wallet code) on a TON chain",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input tokensapi.DeployTokenInput) (sequences.OnChainOutput, error) {
			chain, ok := chains.TonChains()[input.ChainSelector]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("chain %d not found or not a TON chain", input.ChainSelector)
			}

			if a.Package == "" {
				a.Package = utils.ContractsVersionLocal
			}
			// TODO: We should check the Type value in the DeployTokenInput to decide wether we deploy this standard token, wGram, or a cross-chain token implementation
			if input.Type != bindings.ShortJettonMinter {
				return sequences.OnChainOutput{}, fmt.Errorf("unsupported token type %q for TON; only %q is supported", input.Type, bindings.ShortJettonMinter)
			}
			compiledContracts, err := utils.RetrieveCompiledTONContracts(b.GetContext(), b.Logger, &utils.RetrieveCompiledContractsOpts{
				Package: a.Package,
				Contracts: []ton_tvm.FullyQualifiedName{
					bindings.TypeJettonMinter,
					bindings.TypeJettonWallet,
				},
			})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to retrieve contracts: %w", err)
			}
			compiledWallet, ok := compiledContracts[bindings.TypeJettonWallet]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to load jetton wallet code: %w", err)
			}
			compiledMinter, ok := compiledContracts[bindings.TypeJettonMinter]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to load jetton minter code: %w", err)
			}

			storage := minter.InitData{
				TotalSupply:   tlb.ZeroCoins,
				Admin:         chain.Wallet.WalletAddress(),
				TransferAdmin: nil,
				WalletCode:    compiledWallet.Code,
				JettonContent: buildOffchainJettonContent(defaultJettonContentURI),
			}

			topUpMsg, err := tlb.ToCell(jettoncommon.TopUpTons{})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to build jetton deploy body: %w", err)
			}

			initData, err := tlb.ToCell(storage)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to build jetton init data: %w", err)
			}

			conn := tracetracking.NewSignedAPIClient(chain.Client, *chain.Wallet)
			contract, _, err := wrappers.Deploy(
				b.GetContext(),
				&conn,
				compiledMinter.Code,
				initData,
				tlb.MustFromTON(defaultJettonDeployCoin),
				topUpMsg,
			)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to deploy jetton minter: %w", err)
			}

			// TODO: PreMint support — send a MintNewJettons message to the deployed minter
			// when input.PreMint != nil.
			if input.PreMint != nil && *input.PreMint > 0 {
				b.Logger.Warnf("PreMint of %d tokens requested for %s but PreMint is not yet implemented for TON jettons", *input.PreMint, input.Symbol)
			}

			return sequences.OnChainOutput{
				Addresses: []datastore.AddressRef{{
					Address:       contract.Address.String(),
					ChainSelector: input.ChainSelector,
					Type:          datastore.ContractType(bindings.ShortJettonMinter),
					Version:       semver.MustParse("1.0.0"),
					Labels:        datastore.NewLabelSet("package:github.com/smartcontractkit/chainlink-ton/jetton"),
				}},
			}, nil
		},
	)
}

func (a *TonTokenAdapter) DeployTokenPoolForToken() *cldf_ops.Sequence[tokensapi.DeployTokenPoolInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/deploy-token-pool",
		semver.MustParse("1.6.0"),
		"Deploys a MockTokenPool for a jetton on a TON chain",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input tokensapi.DeployTokenPoolInput) (sequences.OnChainOutput, error) {
			chain, ok := chains.TonChains()[input.ChainSelector]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("chain %d not found or not a TON chain", input.ChainSelector)
			}
			if input.TokenRef == nil {
				return sequences.OnChainOutput{}, errors.New("token ref is required to deploy a TON token pool")
			}

			stateCCIP, err := tonstate.LoadCCIPOnChainStateUsingDataStore(input.ExistingDataStore, input.ChainSelector)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to load TON CCIP state for chain %d: %w", input.ChainSelector, err)
			}

			dp, err := dep.NewDependencyProvider(
				dep.Provide(chain),
				dep.Provide(stateCCIP),
			)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
			}

			if a.Package == "" {
				a.Package = utils.ContractsVersionLocal
			}
			compiledContracts, err := utils.RetrieveCompiledTONContracts(b.GetContext(), b.Logger, &utils.RetrieveCompiledContractsOpts{
				Package: a.Package,
				Contracts: []ton_tvm.FullyQualifiedName{
					bindings.TypeMockTokenPool,
				},
			})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to retrieve mock token pool contract: %w", err)
			}

			compiled, ok := compiledContracts[bindings.TypeMockTokenPool]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf(
					"mock token pool contract not found in compiled contracts package under %q",
					bindings.TypeMockTokenPool,
				)
			}
			compiled.Metadata.ID = bindings.TypeMockTokenPool

			addrRef, err := operation.InvokeDeployContractOperation(
				b,
				dp,
				input.ChainSelector,
				compiled,
				struct{}{},
				nil,
				defaultJettonDeployCoin,
			)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to deploy mock token pool: %w", err)
			}

			addrRef.Qualifier = input.TokenPoolQualifier
			if input.PoolType != "" {
				addrRef.Type = datastore.ContractType(input.PoolType)
			}
			if input.TokenPoolVersion != nil {
				addrRef.Version = input.TokenPoolVersion
			}

			return sequences.OnChainOutput{
				Addresses: []datastore.AddressRef{*addrRef},
			}, nil
		},
	)
}

// ConfigureTokenForTransfersSequence registers a jetton and its pool with the on-chain
// TokenRegistry by sending Router_TokenRegistrySetTokenInfo to the Router. The Router
// deploys the per-token registry entry (when IsNewEntry) and forwards TokenRegistry_SetTokenInfo.
func (a *TonTokenAdapter) ConfigureTokenForTransfersSequence() *cldf_ops.Sequence[tokensapi.ConfigureTokenForTransfersInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/configure-token-for-transfers",
		semver.MustParse("1.6.0"),
		"Registers a jetton with the TON TokenRegistry via the Router",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input tokensapi.ConfigureTokenForTransfersInput) (sequences.OnChainOutput, error) {
			chain, ok := chains.TonChains()[input.ChainSelector]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("chain %d not found or not a TON chain", input.ChainSelector)
			}

			tokenAddrStr := input.TokenRef.Address
			if tokenAddrStr == "" {
				return sequences.OnChainOutput{}, errors.New("token ref address is empty")
			}
			tokenAddr, err := address.ParseAddr(tokenAddrStr)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to parse token address %q: %w", tokenAddrStr, err)
			}

			poolAddrStr := input.TokenPoolAddress
			if input.RegistryTokenPoolAddress != "" {
				poolAddrStr = input.RegistryTokenPoolAddress
			}
			if poolAddrStr == "" {
				return sequences.OnChainOutput{}, errors.New("token pool address is empty")
			}
			poolAddr, err := address.ParseAddr(poolAddrStr)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to parse token pool address %q: %w", poolAddrStr, err)
			}

			var routerAddr *address.Address
			if input.RegistryAddress != "" {
				routerAddr, err = address.ParseAddr(input.RegistryAddress)
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to parse registry (router) address %q: %w", input.RegistryAddress, err)
				}
			} else {
				stateCCIP, loadErr := tonstate.LoadCCIPOnChainStateUsingDataStore(input.ExistingDataStore, input.ChainSelector)
				if loadErr != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to load TON CCIP state for chain %d: %w", input.ChainSelector, loadErr)
				}
				r := stateCCIP.Router
				routerAddr = &r
			}

			body := codec.MustWrapMessage[any](bindings.TypeRouter, router.TokenRegistrySetTokenInfo{
				TokenAddress: tokenAddr,
				TokenInfo: tokenregistry.TokenInfo{
					TokenPool:     poolAddr,
					MinterAddress: tokenAddr,
					Enabled:       true,
				},
				IsNewEntry: true,
			})

			dp, err := dep.NewDependencyProvider(dep.Provide(chain))
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
			}

			if _, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
				Messages: []opston.InternalMessage[any]{
					{
						Bounce:  true,
						DstAddr: routerAddr,
						Amount:  tlb.MustFromTON("0.1"),
						Body:    body,
					},
				},
			}); err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to send TokenRegistrySetTokenInfo to router at %s: %w", routerAddr.String(), err)
			}

			return sequences.OnChainOutput{}, nil
		},
	)
}

// TODO: ManualRegistration is a no-op for the minimal skeleton.
func (a *TonTokenAdapter) ManualRegistration() *cldf_ops.Sequence[tokensapi.ManualRegistrationSequenceInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/manual-registration",
		semver.MustParse("1.6.0"),
		"TODO: No-op manual token registration on TON",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input tokensapi.ManualRegistrationSequenceInput) (sequences.OnChainOutput, error) {
			return sequences.OnChainOutput{}, nil
		},
	)
}

// TODO: SetTokenPoolRateLimits is a no-op for the minimal skeleton.
func (a *TonTokenAdapter) SetTokenPoolRateLimits() *cldf_ops.Sequence[tokensapi.TPRLRemotes, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/set-token-pool-rate-limits",
		semver.MustParse("1.6.0"),
		"TODO: No-op token pool rate limit setter on TON",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input tokensapi.TPRLRemotes) (sequences.OnChainOutput, error) {
			return sequences.OnChainOutput{}, nil
		},
	)
}

// TODO: UpdateAuthorities is a no-op for the minimal skeleton. TestAdapter callers
// set SkipOwnershipTransfer=true so this is never executed at runtime, but the
// interface signature must still be satisfied.
func (a *TonTokenAdapter) UpdateAuthorities() *cldf_ops.Sequence[tokensapi.UpdateAuthoritiesInput, sequences.OnChainOutput, *cldf.Environment] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/update-authorities",
		semver.MustParse("1.6.0"),
		"No-op token authority update on TON",
		func(b cldf_ops.Bundle, env *cldf.Environment, input tokensapi.UpdateAuthoritiesInput) (sequences.OnChainOutput, error) {
			return sequences.OnChainOutput{}, nil
		},
	)
}

// TODO: MigrateLockReleasePoolLiquiditySequence is not supported on TON. The interface
// permits returning nil.
func (a *TonTokenAdapter) MigrateLockReleasePoolLiquiditySequence() *cldf_ops.Sequence[tokensapi.MigrateLockReleasePoolLiquidityInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return nil
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// buildOffchainJettonContent mirrors the existing jetton integration helper and stores
// the content as a simple snake string cell.
func buildOffchainJettonContent(symbol string) *cell.Cell {
	b := cell.BeginCell()
	if symbol != "" {
		if err := b.StoreStringSnake(symbol); err != nil {
			return cell.BeginCell().EndCell()
		}
	}
	return b.EndCell()
}
