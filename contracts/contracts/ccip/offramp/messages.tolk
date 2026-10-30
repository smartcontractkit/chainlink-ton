// SPDX-License-Identifier: BUSL-1.1
import "../../lib/deployable/types"
import "../../lib/funding/withdrawable"
import "../../lib/jetton/messages"
import "../../lib/ocr/multi_ocr3_base"
import "../../lib/ocr/types"
import "../../lib/utils"
import "../../lib/versioning/upgradeable"
import "../lib/client/common/types"
import "../lib/client/receiver/types"

import "../accounts/deposit/types"
import "../common/types"
import "../fee_quoter/messages"
import "../merkle_root/messages"
import "../pools/lib/token_pool/messages"
import "../pools/lib/token_pool/types"
import "../receive_executor/messages"
import "../rmn_remote/lib"
import "../router/messages"

import "types"

type OffRamp_InMessage =
    | OffRamp_Commit
    | OffRamp_Execute
    | OffRamp_ExecuteValidated
    | OffRamp_ManuallyExecute
    | OffRamp_DispatchValidated
    | OffRamp_ReleaseOrMint
    | OffRamp_UpdateSourceChainConfigs
    | OffRamp_CCIPReceiveConfirm
    | OffRamp_CCIPReceiveBounced
    | Router_TokenPoolReleaseOrMintFailed
    | OffRamp_NotifyFailure
    | OffRamp_NotifySuccess
    | OffRamp_UpdateCursedSubjects
    | OffRamp_TokenTransferDelivered
    | OffRamp_SetDynamicConfig
    | OCR3Base_SetOCR3Config
    | Upgradeable_Upgrade
    | ReturnExcessesBack
    | Withdrawable_Withdraw;

type OffRamp_InMessageBounced = 
    | ReceiveExecutor_InitExecute
    | Deployable_Initialize
    | Router_RelayReleaseOrMint
    | Router_RouteMessage;

struct (0x9d431905) OffRamp_Commit {
    queryId: uint64;
    reportContext: ReportContext;
    report: CommitReport;
    signatures: SnakedCell<SignatureEd25519>;
}

struct (0x27bdac33) OffRamp_Execute {
    queryId: uint64;
    reportContext: ReportContext;
    report: ExecutionReport;
}

struct (0xc73d5a8a) OffRamp_ExecuteValidated {
    queryId: uint64;
    message: Cell<Any2TVMRampMessage>;
    root: MerkleRootId;
    metadataHash: uint256;
    gasOverride: GasOverride? = null;
    executionState: ExecutionState;
    offchainTokenData: lisp_list<lisp_list<cell>>;
}

struct (0xa00785cf) OffRamp_ManuallyExecute {
    queryId: uint64;
    report: ExecutionReport;
    gasOverride: GasOverride;
}

//Must be sent by owner
struct (0x22b4f05c) OffRamp_UpdateSourceChainConfigs {
    queryId: uint64;
    configs: SnakedCell<SourceChainConfigUpdate>; // Array of configs
}

struct SourceChainConfigUpdate {
    sourceChainSelector: uint64;
    config: SourceChainConfig;
}

//Must be sent from an owned ReceiveExecutor contract
struct (0x58cfcb02) OffRamp_DispatchValidated { 
    queryId: uint64;
    message: Cell<Any2TVMRampMessage>;
    execId: uint192;
    // Gas limit to use for the message execution
    effectiveGasLimit: coins;
    // Token amounts delivered to the receiver, denominated in local token decimals.
    tokenAmounts: SnakedCell<TokenAmount>?;
}

struct (0x28f4166f) OffRamp_CCIPReceiveConfirm {
    queryId: uint64;
    execId: ReceiveExecutorId;
    receiver: address;
}

struct (0x2dcf2a43) OffRamp_CCIPReceiveBounced {
    execId: ReceiveExecutorId;
    receiver: address;
}

struct (0x59e56170) OffRamp_NotifySuccess {
    queryId: uint64;
    header: Cell<RampMessageHeader>;
    execId: ReceiveExecutorId;
    root: address;
    /// Set for token-only messages: the token transfer delivery to relay to the pool.
    delivered: Cell<OffRamp_DeliveredTransfer>? = null;
}

/// Sent by the ReceiveExecutor of a message with data when its token transfer was delivered
/// (messages without data carry this in `OffRamp_NotifySuccess` instead).
struct (0xb4b39784) OffRamp_TokenTransferDelivered {
    queryId: uint64;
    execId: ReceiveExecutorId;
    delivered: Cell<OffRamp_DeliveredTransfer>;
}

struct OffRamp_DeliveredTransfer {
    tokenPool: address;
    transfer: Cell<TokenPool_DeliveredTransfer>;
}

struct (0x177ebd03) OffRamp_NotifyFailure {
    queryId: uint64;
    header: Cell<RampMessageHeader>;
    execId: ReceiveExecutorId;
    root: address;
}

struct (0x4ca1bcb3) OffRamp_UpdateCursedSubjects {
    cursedSubjects: CursedSubjects
}

struct (0x95bc5a5c) OffRamp_SetDynamicConfig {
    queryId: uint64;
    config: OffRamp_DynamicConfig,
}

struct (0x7deaf076) OffRamp_ReleaseOrMint {
    queryId: uint64
    execId: ReceiveExecutorId
    tokenPool: address
    destGasAmount: coins
    requestedFinalityConfig: uint32
    request: Cell<TokenPool_ReleaseOrMintInV1>
}

/// Relays between the executor and the pool, on top of `destGasAmount`: the OffRamp and Router
/// hops, the receiver's deposit account (deploy, init, wallet query, reply) and its storage reserve.
fun OffRamp_ReleaseOrMint.cost(): coins {
    return
        + OFFRAMP_COSTS_RELEASE_OR_MINT_FEE
        + ROUTER_COSTS_RELAY_RELEASE_OR_MINT_FEE
        + OFFRAMP_COSTS_DEPOSIT_ACCOUNT_FEE
        + DepositAccount_MIN_GRAM_TO_RESERVE
        + DepositAccount_WALLET_QUERY_VALUE
        ;
}

// Constants are 3x the measured compute and 2x the measured forward fees (tests/gas-report/ccip) for a 2000-byte message.
struct OffRamp_Costs{}

fun OffRamp_Costs.executeValidated(hasTokens: bool): int {
    val baseFee = OFFRAMP_COSTS_EXECUTE_VALIDATED_FEE;
    return baseFee + DEPLOYABLE_INIT_VALUE + ReceiveExecutor_Costs.initExec(hasTokens);
}

fun OffRamp_Costs.dispatchValidated(): int {
    val baseFee = OFFRAMP_COSTS_DISPATCH_VALIDATED_FEE;
    return baseFee + Router_Costs.routeMessage();
}

fun OffRamp_Costs.receiveConfirmOrDeny(): int {
    val baseFee = OFFRAMP_COSTS_CONFIRM_OR_DENY_FEE;
    return baseFee + ReceiveExecutor_Costs.confirmedOrBounced();
}

/// OffRamp and Router relays of the delivery notice, the pool's `ReleaseOrMintDelivered` and its
/// `ReleaseOrMintFinalized` reply to the executor.
fun OffRamp_Costs.tokenTransferDelivered(): int {
    return OFFRAMP_COSTS_TOKEN_TRANSFER_DELIVERED_FEE;
}

fun OffRamp_Costs.notify(): int {
    val baseFee = OFFRAMP_COSTS_NOTIFY_FEE;
    return baseFee + MerkleRoot_Costs.markState();
}

fun OffRamp_Costs.commit(hasRoots: bool, hasPriceUpdates: bool): int {
    return
        + OFFRAMP_COSTS_COMMIT_FEE
        + (hasRoots ? (OFFRAMP_COSTS_MERKLE_ROOT_INIT_FEE + DEPLOYABLE_INIT_VALUE) as int : 0)
        + (hasPriceUpdates ? FeeQuoter_Costs.updatePrices() : 0)
        ;
}

/// CCIP-owned cost of executing one message; the receiver's `gasLimit` and the pool's
/// `destGasAmount` are added by the caller.
fun OffRamp_Costs.execute(hasTokens: bool): int {
    val baseFee = OFFRAMP_COSTS_EXECUTE_FEE;
    return baseFee + MerkleRoot_Costs.validate(hasTokens);
}

// OffRamp_Execute: hashing a 2000-byte message, a 6-sibling proof (64-message commit) and the
// Validate fwdFee.
const OFFRAMP_COSTS_EXECUTE_FEE = grams("0.014");
// OffRamp_ExecuteValidated: event and InitExecute fwdFee carrying the message, executor deploy.
const OFFRAMP_COSTS_EXECUTE_VALIDATED_FEE = grams("0.0145");
const OFFRAMP_COSTS_DISPATCH_VALIDATED_FEE = grams("0.005");
const OFFRAMP_COSTS_RELEASE_OR_MINT_FEE = grams("0.0025");
const ROUTER_COSTS_RELAY_RELEASE_OR_MINT_FEE = grams("0.006");
// Deposit account deploy, init, wallet response and Initialized reply (or the bounce when it exists).
const OFFRAMP_COSTS_DEPOSIT_ACCOUNT_FEE = grams("0.0065");
const OFFRAMP_COSTS_TOKEN_TRANSFER_DELIVERED_FEE = grams("0.007");
const OFFRAMP_COSTS_NOTIFY_FEE = grams("0.003");
const OFFRAMP_COSTS_CONFIRM_OR_DENY_FEE = grams("0.002");
// OffRamp_Commit with a root and price updates, signature verification included.
const OFFRAMP_COSTS_COMMIT_FEE = grams("0.01");
const OFFRAMP_COSTS_MERKLE_ROOT_INIT_FEE = grams("0.0005");
