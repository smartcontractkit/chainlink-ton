package sequences

import (
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"

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
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/operation"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/minter"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
)

const (
	// defaultJettonDeployCoin is the value (TON) sent with a jetton minter deployment.
	defaultJettonDeployCoin = "1.0"

	// defaultJettonDecimals is returned by DeriveTokenDecimals until the on-chain getter is wired up.
	// TON jettons commonly use 9 decimals; this is good enough for the mock token path used by Ticket 3.
	defaultJettonDecimals uint8 = 9
)

// TonTokenAdapter implements tokensapi.TokenAdapter for TON at CCIP v1.6.0.
// The skeleton lands the registration + the read-side derivation helpers + DeployToken
// (jetton minter). DeployTokenPoolForToken is intentionally left as an error stub —
// it requires the MockTokenPool contract artifact + bindings landed in Ticket 2.
type TonTokenAdapter struct{}

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
	addrCodec := codec.NewAddressCodec()
	raw, err := addrCodec.AddressStringToBytes(ref.Address)
	if err != nil {
		return nil, fmt.Errorf("failed to convert TON address %q to bytes: %w", ref.Address, err)
	}
	return raw, nil
}

// DeriveTokenAddress looks up the deployed jetton minter that shares the pool's qualifier.
// Convention: the DeployTokenInput.Qualifier and DeployTokenPoolInput.TokenPoolQualifier
// match (e.g. both "TEST_TOKEN_USDC"); this lets us resolve the token from the pool ref.
func (a *TonTokenAdapter) DeriveTokenAddress(e cldf.Environment, chainSelector uint64, poolRef datastore.AddressRef) ([]byte, error) {
	candidates := e.DataStore.Addresses().Filter(
		datastore.AddressRefByChainSelector(chainSelector),
		datastore.AddressRefByType(datastore.ContractType(bindings.ShortJettonMinter)),
		datastore.AddressRefByQualifier(poolRef.Qualifier),
	)
	switch len(candidates) {
	case 0:
		return nil, fmt.Errorf("no jetton minter found in datastore for chain %d and qualifier %q", chainSelector, poolRef.Qualifier)
	case 1:
		return a.AddressRefToBytes(candidates[0])
	default:
		return nil, fmt.Errorf("multiple jetton minters found in datastore for chain %d and qualifier %q", chainSelector, poolRef.Qualifier)
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

			walletCode, err := wallet.Code()
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to load jetton wallet code: %w", err)
			}
			minterCode, err := minter.Code()
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to load jetton minter code: %w", err)
			}

			storage := minter.InitData{
				TotalSupply:   tlb.ZeroCoins,
				Admin:         chain.WalletAddress,
				TransferAdmin: chain.WalletAddress,
				WalletCode:    walletCode,
				JettonContent: buildOffchainJettonContent(input.Symbol),
			}

			compiled := opston.CompiledContract{
				Metadata: opston.ContractMetadata{
					Package: "github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton",
					ID:      bindings.TypeJettonMinter,
				},
				Code:    minterCode,
				Version: semver.MustParse("1.0.0"),
			}

			addrRef, err := operation.InvokeDeployContractOperation(b, dp, input.ChainSelector, compiled, storage, nil, defaultJettonDeployCoin)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to deploy jetton minter: %w", err)
			}

			// TODO: PreMint support — send a MintNewJettons message to the deployed minter
			// when input.PreMint != nil. Requires wiring tracetracking.SendWaitTransaction
			// (see deployment/testadapter/test_adapter.go for an analogous pattern).
			if input.PreMint != nil && *input.PreMint > 0 {
				b.Logger.Warnf("PreMint of %d tokens requested for %s but PreMint is not yet implemented for TON jettons", *input.PreMint, input.Symbol)
			}

			return sequences.OnChainOutput{
				Addresses: []datastore.AddressRef{*addrRef},
			}, nil
		},
	)
}

// DeployTokenPoolForToken is a stub: deploying a MockTokenPool requires the artifact
// + bindings landed by Ticket 2. Returning a clear error keeps the interface
// satisfied so registration and DeployToken-only paths succeed.
func (a *TonTokenAdapter) DeployTokenPoolForToken() *cldf_ops.Sequence[tokensapi.DeployTokenPoolInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/deploy-token-pool",
		semver.MustParse("1.6.0"),
		"Deploys a MockTokenPool for a jetton on a TON chain (pending Ticket 2)",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input tokensapi.DeployTokenPoolInput) (sequences.OnChainOutput, error) {
			return sequences.OnChainOutput{}, errors.New(
				"DeployTokenPoolForToken not yet implemented for TON: depends on Ticket 2 (MockTokenPool artifact in contracts-pkg.json + bindings package)",
			)
		},
	)
}

// ConfigureTokenForTransfersSequence is a no-op for the minimal skeleton.
// Token-registry administration on TON happens via the OnRamp's TokenRegistryDeployment
// field at deploy time; per-token enable/disable will be added when source-functional
// TON→EVM transfers are exercised.
func (a *TonTokenAdapter) ConfigureTokenForTransfersSequence() *cldf_ops.Sequence[tokensapi.ConfigureTokenForTransfersInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/configure-token-for-transfers",
		semver.MustParse("1.6.0"),
		"No-op for TON token transfer configuration (minimal skeleton)",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input tokensapi.ConfigureTokenForTransfersInput) (sequences.OnChainOutput, error) {
			return sequences.OnChainOutput{}, nil
		},
	)
}

// ManualRegistration is a no-op for the minimal skeleton.
func (a *TonTokenAdapter) ManualRegistration() *cldf_ops.Sequence[tokensapi.ManualRegistrationSequenceInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/manual-registration",
		semver.MustParse("1.6.0"),
		"No-op manual token registration on TON",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input tokensapi.ManualRegistrationSequenceInput) (sequences.OnChainOutput, error) {
			return sequences.OnChainOutput{}, nil
		},
	)
}

// SetTokenPoolRateLimits is a no-op for the minimal skeleton.
func (a *TonTokenAdapter) SetTokenPoolRateLimits() *cldf_ops.Sequence[tokensapi.TPRLRemotes, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/set-token-pool-rate-limits",
		semver.MustParse("1.6.0"),
		"No-op token pool rate limit setter on TON",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input tokensapi.TPRLRemotes) (sequences.OnChainOutput, error) {
			return sequences.OnChainOutput{}, nil
		},
	)
}

// UpdateAuthorities is a no-op for the minimal skeleton. The TestAdapter (Ticket 3)
// sets SkipOwnershipTransfer=true so this is never executed at runtime, but the
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

// MigrateLockReleasePoolLiquiditySequence is not supported on TON. The interface
// permits returning nil.
func (a *TonTokenAdapter) MigrateLockReleasePoolLiquiditySequence() *cldf_ops.Sequence[tokensapi.MigrateLockReleasePoolLiquidityInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return nil
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// buildOffchainJettonContent builds a TEP-64 off-chain content cell with the symbol
// as the URI. The mock token contract stores this opaquely; the exact bytes are not
// validated end-to-end in the smoke flow.
func buildOffchainJettonContent(symbol string) *cell.Cell {
	b := cell.BeginCell()
	// TEP-64 off-chain tag.
	b.MustStoreUInt(1, 8)
	// Store the symbol as inline ASCII payload (best-effort; capped by cell size).
	if symbol != "" {
		bytesOut := []byte(symbol)
		// 1023 bits per cell; cap at ~100 bytes to stay safely within a single cell.
		if len(bytesOut) > 100 {
			bytesOut = bytesOut[:100]
		}
		b.MustStoreSlice(bytesOut, uint(len(bytesOut)*8))
	}
	return b.EndCell()
}
