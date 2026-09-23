package sequences

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
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
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenadminregistry"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenadminregistryentry"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool/lockbox"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/tokenpool/lockreleaselockbox"
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

	// jettonLockBoxID is the JettonLockBox storage id. It only feeds the lockbox's own
	// address derivation, so a stable value keeps pool/lockbox addresses reproducible
	// across reruns of the deployment pipeline.
	jettonLockBoxID = 1

	// typeJettonLockBox mirrors bindings.TypeJettonLockBox from the root module
	// (pkg/bindings/index.go). The deployment module is still pinned to a published
	// chainlink-ton commit predating that constant, and the pin cannot be bumped yet
	// because cldf/mcms are still built against tonutils-go v1.14.1.
	// TODO(tonutils-upgrade): use bindings.TypeJettonLockBox once this module is
	// re-pinned and rebased onto tonutils-go v1.18.
	typeJettonLockBox ton_tvm.FullyQualifiedName = "link.chain.ton.ccip.pool.JettonLockBox"

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
		"Deploys a LockReleaseLockboxTokenPool for a jetton on a TON chain",
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
					bindings.TypeLockReleaseLockboxTokenPool,
					typeJettonLockBox,
					bindings.TypeJettonWallet,
					bindings.TypeDepositAccount,
				},
			})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to retrieve lock-release token pool contract: %w", err)
			}

			compiled, ok := compiledContracts[bindings.TypeLockReleaseLockboxTokenPool]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf(
					"lock-release token pool contract not found in compiled contracts package under %q",
					bindings.TypeLockReleaseLockboxTokenPool,
				)
			}
			compiled.Metadata.ID = bindings.TypeLockReleaseLockboxTokenPool

			compiledLockBox, ok := compiledContracts[typeJettonLockBox]
			if !ok {
				return sequences.OnChainOutput{}, fmt.Errorf(
					"jetton lockbox contract not found in compiled contracts package under %q",
					typeJettonLockBox,
				)
			}

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

			feeAdmin, err := parseMaybeAddr(input.FeeAdmin)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to parse fee admin address: %w", err)
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
						Router:         &routerAddr,
						RateLimitAdmin: rateLimitAdmin,
						FeeAdmin:       feeAdmin,
						// Unit-value set (map<uint32,()>); an empty dict serializes as an
						// empty map. Must be non-nil: the tlb:"." tag errors on a nil dict.
						AllowedDepositNamespaces: tlbe.NewEmptyDict[uint32, struct{}](),
					},
					JettonClient: tokenpool.JettonClient{
						MasterAddress:    tokenAddr,
						JettonWalletCode: compiledWallet.Code,
					},
					AllowedFinalityConfig: allowedFinality,
					AdvancedPoolHooks:     nil,
				},
				LocalPolicy: tokenpool.LocalPolicy{
					// An empty dict serializes as an empty map (a single "no entries"
					// bit), matching the Tolk contract's createEmptyMap() default.
					// Must be non-nil: the tlb:"." tag errors on a nil dict.
					CursedSubjects: tokenpool.CursedSubjects{
						Data: tlbe.NewEmptyDict[tlbe.Uint128, struct{}](),
					},
				},
				TokenDecimals:           defaultJettonDecimals,
				RemoteChainConfigs:      nil,
				TokenTransferFeeConfigs: nil,
			}

			offRampAccount, ok := compiledContracts[bindings.TypeDepositAccount]
			if !ok {
				return sequences.OnChainOutput{}, errors.New("failed to load off-ramp-account code")
			}

			// The pool keeps the lockbox address in its own storage, so the lockbox has to be
			// built (address-wise) first. Its address derives from the lockbox StateInit, which
			// does not depend on the pool — there is no cycle.
			//
			// `walletAddress` stays null in the deployed storage: the lockbox's init handler
			// writes it from the init message (`onInit` → `st.walletAddress = msg.walletAddress`),
			// so the address we derive here is provisional until init lands. That is fine because
			// the jetton wallet address is a pure function of (minter, lockbox address), both of
			// which we already know.
			lockBoxData := lockbox.Storage{
				ID:            jettonLockBoxID,
				MinterAddress: tokenAddr,
				WalletAddress: nil,
				RBAC:          emptyRBACData(),
			}
			lockBoxDataCell, err := tlb.ToCell(lockBoxData)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to pack jetton lockbox data: %w", err)
			}

			stateInitCell, err := tlb.ToCell(&tlb.StateInit{Code: compiledLockBox.Code, Data: lockBoxDataCell})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to build jetton lockbox state init: %w", err)
			}
			lockBoxAddr := address.NewAddress(0, 0, stateInitCell.Hash())
			lockBoxWalletAddr, err := ton_tvm.CallGetterLatest(b.GetContext(), chain.Client, tokenAddr, minter.GetWalletAddress, lockBoxAddr)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to derive jetton lockbox wallet address: %w", err)
			}

			// LockReleaseLockboxTokenPool's storage is `poolData: Cell<TokenPool_Data>`, so the
			// pool data has to go behind a ref; passing it bare makes every storage read underflow.
			// The lockbox storage must likewise be the FINAL version with the jetton wallet
			// address filled in, since the deploy operation derives the address from the storage
			// it is handed. The lockbox therefore must exist before the pool, which is why the
			// pool address is precomputed from the exact same storage we deploy with.
			storage := lockreleaselockbox.Storage{
				PoolData:           poolData,
				Lockbox:            lockBoxAddr,
				OffRampAccountCode: offRampAccount.Code,
			}

			poolStorageCell, err := tlb.ToCell(storage)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to pack token pool storage: %w", err)
			}
			poolStateInitCell, err := tlb.ToCell(&tlb.StateInit{Code: compiled.Code, Data: poolStorageCell})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to build token pool state init: %w", err)
			}
			poolAddr := address.NewAddress(0, 0, poolStateInitCell.Hash())

			lockBoxQueryID, err := ton_tvm.RandomQueryID()
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to generate lockbox query id: %w", err)
			}
			lockBoxInitBody, err := tlb.ToCell(lockbox.Init{
				QueryID:       lockBoxQueryID,
				MinterAddress: tokenAddr,
				WalletAddress: lockBoxWalletAddr,
				Admin:         owner,
			})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to pack lockbox init body: %w", err)
			}
			lockBoxAddrRef, err := operation.InvokeDeployContractOperation(
				b,
				dp,
				input.ChainSelector,
				compiledLockBox,
				lockBoxData,
				lockBoxInitBody,
				defaultJettonDeployCoin,
			)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to deploy jetton lockbox: %w", err)
			}

			// Authorize the pool on the lockbox. This must happen after init, which rebuilds
			// the RBAC data. Granting to the precomputed pool address is safe: the address is
			// fully determined by the StateInit we are about to deploy verbatim.
			grantQueryID, err := ton_tvm.RandomQueryID()
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to generate lockbox grant query id: %w", err)
			}
			if _, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
				Messages: []opston.InternalMessage[any]{
					{
						Bounce:  true,
						DstAddr: lockBoxAddr,
						Amount:  tlb.MustFromTON("0.1"),
						Body: codec.MustWrapMessage[any](bindings.TypeRBAC, rbac.GrantRole{
							QueryID: grantQueryID,
							Role:    tlbe.NewUint256(big.NewInt(int64(lockbox.OperatorRole))),
							Account: poolAddr,
						}),
					},
				},
				Plan: false,
			}); err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to grant lockbox OPERATOR_ROLE to pool: %w", err)
			}

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

			// Surface the lockbox alongside the pool so callers can fund/upgrade it.
			if lockBoxAddrRef != nil {
				lockBoxAddrRef.Qualifier = input.TokenPoolQualifier
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

// ConfigureTokenForTransfersSequence registers a jetton and its pool with the
// standalone TokenAdminRegistry. The chain deployer is proposed as administrator
// and accepts through the registry, which forwards the authenticated caller to its
// deterministic entry.
func (a *TonTokenAdapter) ConfigureTokenForTransfersSequence() *cldf_ops.Sequence[tokensapi.ConfigureTokenForTransfersInput, sequences.OnChainOutput, cldf_chain.BlockChains] {
	return cldf_ops.NewSequence(
		"ton/sequences/ccip/tooling-api/token-adapter/configure-token-for-transfers",
		semver.MustParse("1.6.0"),
		"Registers a jetton with the TON TokenAdminRegistry",
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
			contractsPackage := a.Package
			if contractsPackage == "" {
				contractsPackage = utils.ContractsVersionLocal
			}
			compiledContracts, err := utils.RetrieveCompiledTONContracts(b.GetContext(), b.Logger, &utils.RetrieveCompiledContractsOpts{
				Package: contractsPackage,
				Contracts: []ton_tvm.FullyQualifiedName{
					bindings.TypeDeployable,
					bindings.TypeTokenAdminRegistryEntry,
				},
			})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("retrieve Deployable code for TokenAdminRegistry entry: %w", err)
			}

			// The OffRamp is registered in the Router's offRamps map by the lane's
			// ApplyRampUpdates sequence; the Router forwards ReleaseOrMint to the pool,
			// so the pool itself no longer tracks per-lane ramps.
			stateCCIP, loadErr := tonstate.LoadCCIPOnChainStateUsingDataStore(input.ExistingDataStore, input.ChainSelector)
			if loadErr != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to load TON CCIP state for chain %d: %w", input.ChainSelector, loadErr)
			}

			var registryAddr *address.Address
			if input.RegistryAddress != "" {
				registryAddr, err = address.ParseAddr(input.RegistryAddress)
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to parse TokenAdminRegistry address %q: %w", input.RegistryAddress, err)
				}
			} else {
				r := stateCCIP.TokenAdminRegistry
				registryAddr = &r
			}

			body := codec.MustWrapMessage[any](bindings.TypeTokenAdminRegistry, tokenadminregistry.RegisterToken{
				TokenAddress: tokenAddr,
				TokenInfo: tokenadminregistryentry.TokenInfo{
					TokenPool:     poolAddr,
					MinterAddress: tokenAddr,
					Version:       1,
				},
				Administrator: chain.Wallet.Address(),
			})

			dp, err := dep.NewDependencyProvider(dep.Provide(chain))
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
			}

			if _, execErr := cldf_ops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
				Messages: []opston.InternalMessage[any]{
					{
						Bounce:  true,
						DstAddr: registryAddr,
						Amount:  tlb.MustFromTON("0.1"),
						Body:    body,
					},
				},
			}); execErr != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to register token at TokenAdminRegistry %s: %w", registryAddr.String(), execErr)
			}

			entryAddr, err := deriveTokenAdminRegistryEntryAddress(registryAddr, tokenAddr, compiledContracts[bindings.TypeDeployable].Code)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("derive TokenAdminRegistry entry address: %w", err)
			}
			if err := waitForTokenAdminRegistryEntryDeployment(chain.Client, entryAddr, compiledContracts[bindings.TypeTokenAdminRegistryEntry].Code); err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("wait for TokenAdminRegistry entry deployment at %s: %w", entryAddr.String(), err)
			}
			acceptBody := codec.MustWrapMessage[any](bindings.TypeTokenAdminRegistry, tokenadminregistry.AcceptAdminRole{
				TokenAddress: tokenAddr,
			})
			if _, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
				Messages: []opston.InternalMessage[any]{
					{
						Bounce:  true,
						DstAddr: registryAddr,
						Amount:  tlb.MustFromTON("0.05"),
						Body:    acceptBody,
					},
				},
			}); err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to accept TokenAdminRegistry administrator role for token %s: %w", tokenAddr.String(), err)
			}

			// Configure the pool's remote-chain token addresses.
			if err := applyRemoteChainUpdates(b, dp, poolAddr, input.RemoteChains); err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to configure remote chains on token pool at %s: %w", poolAddr.String(), err)
			}

			return sequences.OnChainOutput{}, nil
		},
	)
}

// deriveTokenAdminRegistryEntryAddress mirrors TokenAdminRegistryEntry.deriveAddress
// in contracts/contracts/ccip/token_admin_registry_entry/types.tolk. The entry is a
// Deployable whose data is (root, TokenRegistry namespace, token address).
func deriveTokenAdminRegistryEntryAddress(registryAddr, tokenAddr *address.Address, deployableCode *cell.Cell) (*address.Address, error) {
	if registryAddr == nil || tokenAddr == nil || deployableCode == nil {
		return nil, errors.New("registry address, token address, and deployable code are required")
	}
	data := cell.BeginCell().MustStoreAddr(registryAddr).MustStoreUInt(3, 32).MustStoreAddr(tokenAddr).EndCell()
	return tlb.StateInit{Code: deployableCode, Data: data}.CalcAddress(0), nil
}

// waitForTokenAdminRegistryEntryDeployment waits until the entry address no
// longer runs the Deployable initializer code. RegisterToken deploys the entry
// asynchronously through the registry root, so accepting administration before
// this transition would be rejected with Deployable_Error.NotOwner (9200).
func waitForTokenAdminRegistryEntryDeployment(client ton.APIClientWrapped, entryAddr *address.Address, entryCode *cell.Cell) error {
	if client == nil || entryAddr == nil || entryCode == nil {
		return errors.New("client, entry address, and entry code are required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		block, err := client.CurrentMasterchainInfo(ctx)
		if err == nil {
			account, accountErr := client.WaitForBlock(block.SeqNo).GetAccount(ctx, block, entryAddr)
			if accountErr == nil && account.IsActive && account.Code != nil && bytes.Equal(account.Code.Hash(), entryCode.Hash()) {
				return nil
			}
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("entry did not become active with its expected code within 30s: %w", ctx.Err())
		case <-ticker.C:
		}
	}
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

	body := codec.MustWrapMessage[any](bindings.TypeLockReleaseLockboxTokenPool, tokenpool.ApplyChainUpdates{
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

// disabledRateLimitConfigPair returns a fully-disabled rate limiter pair.
func disabledRateLimitConfigPair() tokenpool.RateLimitConfigPair {
	disabled := tokenpool.RateLimitConfig{
		IsEnabled: false,
		Capacity:  big.NewInt(0),
		Rate:      big.NewInt(0),
	}
	return tokenpool.RateLimitConfigPair{Outbound: disabled, Inbound: disabled}
}

// emptyRBACData returns RBAC data with no roles set, matching the lockbox's
// pre-init state. Init fills the roles in.
func emptyRBACData() rbac.Data {
	return rbac.Data{Roles: tlbe.NewEmptyDict[tlbe.Uint256, rbac.RoleData]()}
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
// TON's LockReleaseLockboxTokenPool does not enforce rate limits yet, so there is never a
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
