package sequences

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math/big"

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

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	jettoncommon "github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/minter"
	jettonwallet "github.com/smartcontractkit/chainlink-ton/pkg/bindings/jetton/wallet"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool/lockrelease"
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

	// defaultJettonMintCoin is the TON value attached to a MintNewJettons message; it must
	// cover the forwarded amount plus gas for deploying the recipient's jetton wallet.
	defaultJettonMintCoin = "0.1"

	// defaultJettonMintForwardCoin is the TON forwarded to the recipient's jetton wallet on mint.
	defaultJettonMintForwardCoin = "0.05"

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
var _ tokensapi.RateLimitReaderAdapter = (*TonTokenAdapter)(nil)

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

			// Pre-mint tokens to the deployer (or the first configured sender) so the
			// account has a balance to transfer during token-transfer tests. The deployer
			// wallet is the jetton admin (see InitData.Admin above) and is therefore
			// authorized to mint.
			if input.PreMint != nil && *input.PreMint > 0 {
				recipient := chain.Wallet.WalletAddress()
				if len(input.Senders) > 0 && input.Senders[0] != "" {
					parsed, parseErr := address.ParseAddr(input.Senders[0])
					if parseErr != nil {
						return sequences.OnChainOutput{}, fmt.Errorf("failed to parse pre-mint recipient %q: %w", input.Senders[0], parseErr)
					}
					recipient = parsed
				}

				// PreMint is expressed in whole tokens; scale to base units by the token decimals.
				mintBaseUnits := new(big.Int).Mul(
					new(big.Int).SetUint64(*input.PreMint),
					new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(input.Decimals)), nil),
				)
				mintAmount, mintErr := tlb.FromNano(mintBaseUnits, int(input.Decimals))
				if mintErr != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to build pre-mint amount: %w", mintErr)
				}

				queryID, qErr := ton_tvm.RandomQueryID()
				if qErr != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to generate query id for pre-mint: %w", qErr)
				}

				mintMsg, mintErr := contract.CallWaitRecursively(minter.MintNewJettons{
					QueryID:       queryID,
					MintRecipient: recipient,
					TonAmount:     tlb.MustFromTON(defaultJettonMintForwardCoin),
					InternalTransferMsg: jettonwallet.InternalTransferStep{
						QueryID:           queryID,
						JettonAmount:      mintAmount,
						TransferInitiator: chain.Wallet.WalletAddress(),
						SendExcessesTo:    chain.Wallet.WalletAddress(),
						ForwardTonAmount:  tlb.ZeroCoins,
						ForwardPayload:    nil,
					},
				}, tlb.MustFromTON(defaultJettonMintCoin))
				if mintErr != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to pre-mint %d tokens to %s: %w", *input.PreMint, recipient.String(), mintErr)
				}

				mintExitCode, ecErr := mintMsg.ExitCode()
				if ecErr != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to get pre-mint exit code: %w", ecErr)
				}
				if mintExitCode != ton_tvm.ExitCodeSuccess {
					return sequences.OnChainOutput{}, fmt.Errorf("pre-mint message rejected: exit code %d: %s", mintExitCode, mintExitCode.Describe())
				}

				traceExitCode, teErr := mintMsg.TraceExitCode()
				if teErr != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to get pre-mint trace exit code: %w", teErr)
				}
				if traceExitCode != ton_tvm.ExitCodeSuccess {
					return sequences.OnChainOutput{}, fmt.Errorf("pre-mint %d tokens to %s failed: trace exit code %d: %s", *input.PreMint, recipient.String(), traceExitCode, traceExitCode.Describe())
				}

				recipientWalletAddr, walletAddrErr := ton_tvm.CallGetterLatest(b.GetContext(), chain.Client, contract.Address, minter.GetWalletAddress, recipient)
				if walletAddrErr != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to derive jetton wallet address for pre-mint recipient %s: %w", recipient.String(), walletAddrErr)
				}
				recipientBalance, balanceErr := ton_tvm.CallGetterLatest(b.GetContext(), chain.Client, recipientWalletAddr, jettonwallet.GetWalletData)
				if balanceErr != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to read jetton balance for pre-mint recipient %s: %w", recipient.String(), balanceErr)
				}

				if recipientBalance.Cmp(mintBaseUnits) != 0 {
					return sequences.OnChainOutput{}, fmt.Errorf("pre-mint balance mismatch for %s: expected %s base units, got %s", recipient.String(), mintBaseUnits.String(), recipientBalance.String())
				}
			}

			return sequences.OnChainOutput{
				Addresses: []datastore.AddressRef{{
					Address:       contract.Address.String(),
					ChainSelector: input.ChainSelector,
					Type:          datastore.ContractType(bindings.ShortJettonMinter),
					Version:       semver.MustParse("1.0.0"),
					Qualifier:     input.Symbol,
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
		"Deploys a LockReleaseTokenPool for a jetton on a TON chain",
		func(b cldf_ops.Bundle, chains cldf_chain.BlockChains, input tokensapi.DeployTokenPoolInput) (sequences.OnChainOutput, error) {
			chain, ok := chains.TonChains()[input.ChainSelector]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf("chain %d not found or not a TON chain", input.ChainSelector)
			}
			if input.TokenRef == nil {
				return sequences.OnChainOutput{}, errors.New("token ref is required to deploy a TON token pool")
			}
			tokenAddr, err := address.ParseAddr(input.TokenRef.Address)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to parse token ref address %q: %w", input.TokenRef.Address, err)
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
					bindings.TypeLockReleaseTokenPool,
					bindings.TypeJettonWallet,
					bindings.TypeDepositAccount,
				},
			})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to retrieve lock-release token pool contract: %w", err)
			}

			compiled, ok := compiledContracts[bindings.TypeLockReleaseTokenPool]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf(
					"lock-release token pool contract not found in compiled contracts package under %q",
					bindings.TypeLockReleaseTokenPool,
				)
			}
			compiled.Metadata.ID = bindings.TypeLockReleaseTokenPool

			compiledWallet, ok := compiledContracts[bindings.TypeJettonWallet]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf(
					"jetton wallet contract not found in compiled contracts package under %q",
					bindings.TypeJettonWallet,
				)
			}

			// The owner and RMN proxy are both set to the deployer wallet; RMN is not yet
			// wired up on TON, so this is a placeholder like the productive pool wrappers use.
			owner := chain.Wallet.WalletAddress()

			routerAddr := stateCCIP.Router
			if input.RouterRef != nil && input.RouterRef.Address != "" {
				parsedRouter, routerErr := address.ParseAddr(input.RouterRef.Address)
				if routerErr != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to parse router ref address %q: %w", input.RouterRef.Address, routerErr)
				}
				routerAddr = *parsedRouter
			}

			rateLimitAdmin, err := parseMaybeAddr(input.RateLimitAdmin)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to parse rate limit admin address %q: %w", input.RateLimitAdmin, err)
			}

			feeAdmin, err := parseMaybeAddr(input.FeeAggregator)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to parse fee aggregator address: %w", err)
			}
			rawFinality := input.AllowedFinalityConfig.Raw()
			allowedFinality := binary.BigEndian.Uint32(rawFinality[:])

			// Storage mirrors the productive TokenPool_Data layout (see
			// contracts/contracts/ccip/pools/lib/token_pool/entrypoint.tolk and the e2e test
			// setup in contracts/tests/ccip/e2e/CCIPSendWithTokenTransfer.spec.ts); remote
			// chain configs are populated later via ApplyChainUpdates.
			poolData := tokenpool.Storage{
				AdminConfig: tokenpool.AdminConfig{
					Ownable: ownable2step.Storage{
						Owner:        owner,
						PendingOwner: nil,
					},
					RMNProxy: owner,
					DynamicConfig: tokenpool.DynamicConfig{
						Router:                   &routerAddr,
						RateLimitAdmin:           rateLimitAdmin,
						FeeAdmin:                 feeAdmin,
						AllowedDepositNamespaces: tlbe.NewEmptyDict[uint32, bool](),
					},
					JettonClient: tokenpool.JettonClient{
						MasterAddress:    tokenAddr,
						JettonWalletCode: compiledWallet.Code,
					},
					AllowedFinalityConfig: allowedFinality,
					AdvancedPoolHooks:     nil,
				},
				MirroredPolicy: tokenpool.MirroredPolicy{
					// nil dicts serialize as an empty map (a single "no entries" bit), matching
					// the Tolk contract's createEmptyMap() default.
					OnRamps:        nil,
					OffRamps:       nil,
					CursedSubjects: tokenpool.CursedSubjects{Data: nil},
				},
				TokenDecimals:           defaultJettonDecimals,
				RemoteChainConfigs:      nil,
				TokenTransferFeeConfigs: nil,
			}

			offRampAccount, ok := compiledContracts[bindings.TypeDepositAccount]
			if !ok {
				return sequences.OnChainOutput{}, errors.New("failed to load off-ramp-account code")
			}

			// LockReleaseTokenPool's storage is `poolData: Cell<TokenPool_Data>`, so the pool data
			// has to go behind a ref; passing it bare makes every storage read underflow.
			storage := lockrelease.Storage{PoolData: poolData, OffRampAccountCode: offRampAccount.Code}

			addrRef, err := operation.InvokeDeployContractOperation(
				b,
				dp,
				input.ChainSelector,
				compiled,
				storage,
				nil,
				defaultJettonDeployCoin,
			)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to deploy lock-release token pool: %w", err)
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

			// The OffRamp always comes from the datastore: it is the contract that sends
			// TokenPool_ReleaseOrMint to the pool, so it must be registered as the pool's
			// trusted offRamp (see applyRampAccessUpdates below).
			stateCCIP, loadErr := tonstate.LoadCCIPOnChainStateUsingDataStore(input.ExistingDataStore, input.ChainSelector)
			if loadErr != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to load TON CCIP state for chain %d: %w", input.ChainSelector, loadErr)
			}

			var routerAddr *address.Address
			if input.RegistryAddress != "" {
				routerAddr, err = address.ParseAddr(input.RegistryAddress)
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to parse registry (router) address %q: %w", input.RegistryAddress, err)
				}
			} else {
				r := stateCCIP.Router
				routerAddr = &r
			}

			var offRampAddr *address.Address
			if !stateCCIP.OffRamp.IsAddrNone() {
				o := stateCCIP.OffRamp
				offRampAddr = &o
			} else if len(input.RemoteChains) > 0 {
				return sequences.OnChainOutput{}, fmt.Errorf("no OffRamp address found in the datastore for chain %d: the token pool would reject inbound ReleaseOrMint with TokenPool_Error.Unauthorized", input.ChainSelector)
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

			// Configure the pool's remote-chain token addresses.
			if err := applyRemoteChainUpdates(b, dp, poolAddr, input.RemoteChains); err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to configure remote chains on token pool at %s: %w", poolAddr.String(), err)
			}

			// Register the Router as the pool's trusted onRamp and the OffRamp as its trusted
			// offRamp for every remote chain being wired up.
			// TODO This should be changed in the contracts flow so that the onramp is the one calling instead of the Router
			if err := applyRampAccessUpdates(b, dp, poolAddr, routerAddr, offRampAddr, input.RemoteChains); err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to configure ramp access on token pool at %s: %w", poolAddr.String(), err)
			}

			return sequences.OnChainOutput{}, nil
		},
	)
}

// applyRemoteChainUpdates builds a TokenPool_ApplyChainUpdates message from the
// resolved remote-chain configs and sends it to the token pool. It is a no-op when
// no remote chains are provided. The remote token/pool addresses are resolved by the
// changeset (see convertRemoteChainConfig in chainlink-ccip/deployment/tokens),
// left-padded to 32 bytes for EVM remotes, before reaching here.
func applyRemoteChainUpdates(
	b cldf_ops.Bundle,
	dp *dep.DependencyProvider,
	poolAddr *address.Address,
	remoteChains map[uint64]tokensapi.RemoteChainConfig[[]byte, string],
) error {
	if len(remoteChains) == 0 {
		return nil
	}

	chainsToAdd := make(common.SnakedCell[tokenpool.ChainUpdate], 0, len(remoteChains))
	for remoteSelector, rc := range remoteChains {
		if len(rc.RemoteToken) == 0 {
			return fmt.Errorf("remote token address is empty for remote chain %d", remoteSelector)
		}
		remoteTokenCell, err := tlbe.NewCellFrom(common.CrossChainAddress(rc.RemoteToken))
		if err != nil {
			return fmt.Errorf("failed to build remote token address cell for chain %d: %w", remoteSelector, err)
		}

		remotePools := common.SnakedCell[common.CrossChainAddress]{}
		if len(rc.RemotePool) > 0 {
			remotePools = append(remotePools, common.CrossChainAddress(rc.RemotePool))
		}

		chainsToAdd = append(chainsToAdd, tokenpool.ChainUpdate{
			RemoteChainSelector: remoteSelector,
			RemotePoolAddresses: remotePools,
			RemoteTokenAddress:  remoteTokenCell,
			// The pool ignores rate limiters; a disabled pair keeps the message
			// compatible with the productive TokenPool.
			RateLimitConfigs: disabledRateLimitConfigPair(),
		})
	}

	body := codec.MustWrapMessage[any](bindings.TypeLockReleaseTokenPool, tokenpool.ApplyChainUpdates{
		RemoteChainSelectorsToRemove: common.SnakedCell[tokenpool.ChainSelector]{},
		ChainsToAdd:                  chainsToAdd,
	})

	_, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
		Messages: []opston.InternalMessage[any]{
			{
				Bounce:  true,
				DstAddr: poolAddr,
				Amount:  tlb.MustFromTON("0.1"),
				Body:    body,
			},
		},
	})
	return err
}

// applyRampAccessUpdates registers onRamp/offRamp as the trusted local ramps for every
// remote chain in remoteChains, via TokenPool_UpdateRampAccess. It is a no-op when no
// remote chains are provided. Without this, the pool's mirroredPolicy.onRamps/offRamps
// maps stay empty and TokenPool.ensureOutboundAccess/ensureInboundAccess (entrypoint.tolk)
// reject LockOrBurn/ReleaseOrMint with TokenPool_Error.Unauthorized.
func applyRampAccessUpdates(
	b cldf_ops.Bundle,
	dp *dep.DependencyProvider,
	poolAddr *address.Address,
	onRamp *address.Address,
	offRamp *address.Address,
	remoteChains map[uint64]tokensapi.RemoteChainConfig[[]byte, string],
) error {
	if len(remoteChains) == 0 {
		return nil
	}

	updates := make(common.SnakedCell[tokenpool.RampUpdate], 0, len(remoteChains))
	for remoteSelector := range remoteChains {
		updates = append(updates, tokenpool.RampUpdate{
			RemoteChainSelector: remoteSelector,
			OnRamp:              onRamp,
			OffRamp:             offRamp,
		})
	}

	queryID, err := ton_tvm.RandomQueryID()
	if err != nil {
		return fmt.Errorf("failed to generate query id for ramp access update: %w", err)
	}

	body := codec.MustWrapMessage[any](bindings.TypeLockReleaseTokenPool, tokenpool.UpdateRampAccess{
		QueryID: queryID,
		Updates: updates,
	})

	_, err = cldf_ops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
		Messages: []opston.InternalMessage[any]{
			{
				Bounce:  true,
				DstAddr: poolAddr,
				Amount:  tlb.MustFromTON("0.1"),
				Body:    body,
			},
		},
	})
	return err
}

// disabledRateLimitConfigPair returns a fully-disabled rate limiter pair.
func disabledRateLimitConfigPair() tokenpool.RateLimitConfigPair {
	disabled := tokenpool.RateLimitConfig{
		IsEnabled: false,
		Capacity:  big.NewInt(0),
		Rate:      big.NewInt(0),
	}
	return tokenpool.RateLimitConfigPair{Outbound: disabled, Inbound: disabled}
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

// GetOnchainRateLimits reports the on-chain outbound and inbound rate limits for a lane.
// TON's LockReleaseTokenPool does not enforce rate limits yet, so there is never a
// configured bucket: return disabled zero-value configs. FastFinality is not a
// concept on TON, so reject that bucket per the interface contract.
func (a *TonTokenAdapter) GetOnchainRateLimits(
	b cldf_ops.Bundle,
	chains cldf_chain.BlockChains,
	ds datastore.DataStore,
	chainSelector uint64,
	poolRef datastore.AddressRef,
	tokenRef datastore.AddressRef,
	remoteSelector uint64,
	fastFinality bool,
) (tokensapi.OnchainRateLimits, error) {
	if fastFinality {
		return tokensapi.OnchainRateLimits{}, fmt.Errorf("fast finality rate limits are not supported on TON (chain selector %d)", chainSelector)
	}
	disabled := tokensapi.RateLimiterConfig{
		IsEnabled: false,
		Capacity:  big.NewInt(0),
		Rate:      big.NewInt(0),
	}
	return tokensapi.OnchainRateLimits{
		Outbound: disabled,
		Inbound:  disabled,
	}, nil
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

// Parses the address, if the string is empty returns a non initialized address
func parseMaybeAddr(addr string) (*address.Address, error) {
	var out *address.Address
	if addr != "" {
		var err error
		out, err = address.ParseAddr(addr)
		if err != nil {
			return out, fmt.Errorf("failed to parse address %q: %w", addr, err)
		}
	}
	return out, nil
}
