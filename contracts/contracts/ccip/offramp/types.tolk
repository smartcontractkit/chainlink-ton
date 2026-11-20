// SPDX-License-Identifier: BUSL-1.1
import "@stdlib/lisp-lists"
import "../../lib/utils"
import "../lib/client/receiver/types"
import "../lib/cross_chain_address/types"
import "../common/types"
import "../fee_quoter/types"

import "errors"

const OffRamp_FACILITY_NAME = "link.chain.ton.ccip.OffRamp";
const OffRamp_FACILITY_ID = OffRamp_FACILITY_NAME.crc32() % 640 + 10;  // 221
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

struct ExecutionReport {
    sourceChainSelector: uint64;
    messages: SnakedCell<Any2TVMRampMessage>;
    // Offchain token data for every message and token transfer in the report.
    // A tokenless report may use either `[]` (empty outer list) or `[[]]` (one
    // empty per-message list); both are accepted. When there are token
    // transfers, each outer entry is a message and each inner entry is that
    // message's token-data blob.
    // WARNING: offchainTokenData is untrusted data.
    offchainTokenData: lisp_list<lisp_list<cell>>;
    proofs: SnakedCell<uint256>; // Proofs used to construct the merkle root as vec<uint256>
    proofFlagBits: uint256;
}

struct GasOverride {
    receiverExecutionGasLimit: coins? = null;
    tokenGasOverrides: SnakedCell<coins>? = null
}

/// Execution parameters of a message, parsed from the report and the manual execution gas override
/// by the first OffRamp handler (onExecuteSingleReport), which rejects the execution when they are
/// invalid. Relayed through the MerkleRoot as an opaque `context` cell (MerkleRoot_Validate ->
/// OffRamp_ExecuteValidated) and consumed by onExecuteValidated without validating it again.
///
/// The opcode versions the layout: a new layout gets a new struct (and opcode), so a context built
/// by a different OffRamp version is rejected instead of misread.
///
/// Offchain token data is not part of the context: it is not supported yet, so the only valid
/// value (one empty entry per token transfer) carries no information.
struct (0xbb577e7a) OffRamp_ExecutionContext {
    /// Gas forwarded to the receiver: the message's gasLimit, or the manual override when set.
    effectiveGasLimit: coins;
    /// Gas for each of the message's token transfers, in order: the transfer's destGasAmount, or
    /// the manual override when set. Empty when the message has no token transfers.
    tokenDestGasAmounts: lisp_list<coins>;
}

/// Parses the execution context of `message`, applying the manual execution `gasOverride` (null
/// for DON executions). A zero override (receiver or token) means "no override".
///
/// The number of token transfers is NOT validated here: a message with an unsupported number of
/// transfers is marked Failure by onExecuteValidated, so it can be executed once supported.
///
/// @note from evm:
///
/// The gas limit can not be lowered as that could cause the message to fail. If manual execution is done
/// from an UNTOUCHED state and we would allow lower gas limit, anyone could grief by executing the message with
/// lower gas limit than the DON would have used. This results in the message being marked FAILURE and the DON
/// would not attempt it with the correct gas limit.
///
/// @throws OffRamp_Error.InvalidManualExecutionGasLimit if a non-zero override is lower than the
/// message's gasLimit (receiver) or the transfer's destGasAmount (token).
/// @throws OffRamp_Error.ManualExecutionGasAmountCountMismatch if tokenGasOverrides is set and does
/// not have exactly one entry per token transfer.
fun OffRamp_ExecutionContext.parse(message: Any2TVMRampMessage, gasOverride: GasOverride?): OffRamp_ExecutionContext {
    var effectiveGasLimit = message.gasLimit;
    var hasTokenGasOverrides = false;
    var tokenGasOverrides = Iterator<coins>.new(createEmptyCell());
    if (gasOverride != null) {
        val receiverGasOverride = gasOverride.receiverExecutionGasLimit;
        if (receiverGasOverride != null && receiverGasOverride != 0) {
            assert (receiverGasOverride >= message.gasLimit) throw (OffRamp_Error.InvalidManualExecutionGasLimit);
            effectiveGasLimit = receiverGasOverride;
        }
        if (gasOverride.tokenGasOverrides != null) {
            hasTokenGasOverrides = true;
            tokenGasOverrides = gasOverride.tokenGasOverrides.iter();
        }
    }

    var backwardsTokenDestGasAmounts: lisp_list<coins> = [];
    if (message.tokenAmounts != null) {
        var transfers = message.tokenAmounts.iter();
        while (!transfers.empty()) {
            var destGasAmount = transfers.next().destGasAmount;
            if (hasTokenGasOverrides) {
                assert (!tokenGasOverrides.empty()) throw (OffRamp_Error.ManualExecutionGasAmountCountMismatch);
                val tokenGasOverride = tokenGasOverrides.next();
                if (tokenGasOverride != 0) {
                    assert (tokenGasOverride >= destGasAmount) throw (OffRamp_Error.InvalidManualExecutionGasLimit);
                    destGasAmount = tokenGasOverride;
                }
            }
            backwardsTokenDestGasAmounts.prependHead(destGasAmount);
        }
    }
    assert (tokenGasOverrides.empty()) throw (OffRamp_Error.ManualExecutionGasAmountCountMismatch);

    return {
        effectiveGasLimit,
        tokenDestGasAmounts: backwardsTokenDestGasAmounts.calculateReversed(),
    };
}

/// Total gas of the message's token transfers.
fun OffRamp_ExecutionContext.tokenDestGasTotal(self): coins {
    var total: coins = 0;
    var amounts = self.tokenDestGasAmounts;
    while (!amounts.isEmpty()) {
        total += amounts.popHead();
    }
    return total;
}

// Matches the EVM struct
struct CommitReport {
    priceUpdates: Cell<PriceUpdates>? = null; // Price updates for the fee_quoter
    merkleRoots: SnakedCell<MerkleRoot>; // Merkle roots is always size one, but interface is set up to possibly support multiple in the future
}

struct Any2TVMMessageV1Metadata {
    _header: uint256 = "Any2TVMMessageHashV1".sha256();
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    onRamp: Cell<CrossChainAddress>;
}

struct DeployableHashes {
    merkleRoot: uint256;
    receiveExecutor: uint256;
    deployer: uint256;
}

struct OffRamp_DynamicConfig {
    feeQuoter: address
    permissionlessExecutionThresholdSeconds: uint32
    minGasLimit: coins
    minTTGasLimit: coins
}

// Config is the backwards-compatible struct returned by the config() getter.
//
// Field order matches the TVM stack returned by the getter:
//   0: chainSelector
//   1: feeQuoter
//   2: permissionlessExecutionThresholdSeconds
//   3: tokenAdminRegistry (appended for backwards compat; old contracts return 3 elements)
//   4: minGasLimit         (appended by this PR; old contracts return 4 elements)
//   5: minTTGasLimit       (appended by this PR; old contracts return 5 elements)
//
// New fields are appended at the end so old contracts and old Go readers remain
// compatible — they simply read fewer stack elements.
struct Config {
    // -- Static config
    chainSelector: uint64
    // gasForCallExactCheck
    // rmnRemote
    // nonceManager
    // -- Dynamic config
    feeQuoter: address
    permissionlessExecutionThresholdSeconds: uint32
    // isRMNVerificationDisabled
    // messageInterceptor
    // -- Static config (appended for backwards compatibility; old contracts
    // return a 3-element stack and omit this field)
    tokenAdminRegistry: address
    // -- Dynamic config (appended by this PR; old contracts return a 4-element
    // stack and omit these fields)
    minGasLimit: coins
    minTTGasLimit: coins
}

// Kept in a reference because three full-width values would overflow the
// OffRamp root data cell alongside ownership and mutable state.
struct OffRamp_StaticConfig {
    rmnRouter: address;
    tokenAdminRegistry: address;
    chainSelector: uint64;
}

// Combines the static and dynamic config into a single cell so the OffRamp root
// Storage struct stays within the TVM 4-ref serialization limit. The dynamic
// config is itself kept in a reference because inlining it would overflow the
// 1023-bit limit of this struct.
struct OffRamp_StorageConfig {
    staticConfig: OffRamp_StaticConfig;
    dynamicConfig: Cell<OffRamp_DynamicConfig>;
}

struct SourceChainConfig {
    router: address;
    isEnabled: bool;
    minSeqNr: uint64;
    isRMNVerificationDisabled: bool;
    onRamp: CrossChainAddress;
}

struct Any2TVMRampMessage {
    header: RampMessageHeader;
    sender: Cell<CrossChainAddress>;
    data: SnakedCell<byte>;
    receiver: address;
    gasLimit: coins;
    tokenAmounts: SnakedCell<Any2TVMTokenTransfer>?;
    // maybe mark these amounts as slice remaining then parse them by hand to avoid requiring this to be a map<> at send time?
}

fun Any2TVMRampMessage.generateMessageId(self, metadataHash: uint256): uint256 {
    // Loosely based on https://github.com/smartcontractkit/chainlink-ccip/blob/2d2ce6abb3f7626dbd3008e4232da4faa839feff/chains/evm/contracts/libraries/Internal.sol#L113-L134
    return Any2TVMRampMessageIDData{
        metadataHash,
        metadata: Any2TVMRampMessageIDHeader {
            messageId: self.header.messageId,
            receiver: self.receiver,
            sequenceNumber: self.header.sequenceNumber,
            gasLimit: self.gasLimit,
            nonce: self.header.nonce,
        }.toCell(),
        sender: self.sender,
        data: self.data,
        tokenAmounts: self.tokenAmounts
    }.toCell().hash();
}


struct Any2TVMRampMessageIDData {
    _leafDomainSeparator: bits256 = LEAF_DOMAIN_SEPARATOR;
    metadataHash: uint256;
    metadata: Cell<Any2TVMRampMessageIDHeader>;
    sender: Cell<CrossChainAddress>;
    data: SnakedCell<byte>;
    tokenAmounts: SnakedCell<Any2TVMTokenTransfer>?
}

struct Any2TVMRampMessageIDHeader {
    messageId: uint256;
    receiver: address;
    sequenceNumber: uint64;
    gasLimit: coins;
    nonce: uint64;
}

struct MerkleRoot {
    sourceChainSelector: uint64;
    onRampAddress: CrossChainAddress;
    minSeqNr: uint64;
    maxSeqNr: uint64;
    merkleRoot: uint256;
}

struct Any2TVMTokenTransfer {
    sourcePoolAddress: Cell<CrossChainAddress>;
    token: address;
    destGasAmount: coins;
    // Data from the source pool to be passed to the destination pool.
    extraData: cell?;
    // amount of transfered tokens in source chain decimals
    amount: uint256;
}



const MERKLE_ROOT_ID_SIZE = 256;
const RECEIVE_EXECUTOR_ID_SIZE = 192;

type MerkleRootId = uint256;

fun ReceiveExecutionID.getSourceChainSelector(self): uint64 {
    var cs = beginCell().storeUint(self, RECEIVE_EXECUTOR_ID_SIZE).endCell().beginParse();
    return cs.loadUint(64);
}

// These have to match the EVM states
enum ExecutionState: uint8 {
    Untouched = 0
    InProgress = 1
    Success = 2
    Failure = 3
}

/// Shape every source lane is configured to send (FeeQuoter `maxDataBytes` for TON); the receive
/// cost functions are calibrated for it and the OffRamp rejects anything larger.
const OFFRAMP_MAX_DATA_BYTES = 2000;
/// `extraData` of a token transfer carries at most the source pool's encoded decimals.
const OFFRAMP_MAX_EXTRA_DATA_BITS = 256;
