// SPDX-License-Identifier: BUSL-1.1
tolk 1.2

import "../lib/utils";
import "../lib/secp256k1";
import "../lib/access/ownable_2step.tolk";
import "../lib/crypto/merkle_proof.tolk";

const CONTRACT_VERSION = "0.0.4";

/// This is a multi-sig contract that supports signing many transactions (called "ops" in
/// the context of this contract to prevent confusion with transactions on the underlying chain)
/// targeting many chains with a single set of signatures. Authorized ops along with some metadata
/// are stored in a Merkle tree, which is generated offchain. Each op has an associated chain id,
/// ManyChainMultiSig contract address and nonce. The nonce enables us to enforce the
/// (per-ManyChainMultiSig contract instance) ordering of ops.
///
/// At any time, this contract stores at most one Merkle root. In the typical case, all ops
/// in the Merkle tree are expected to be executed before another root is set. Since the Merkle root
/// itself reveals ~ no information about the tree's contents, we take two measures to improve
/// transparency. First, we attach an expiration time to each Merkle root after which it cannot
/// be used any more. Second, we embed metadata in the tree itself that has to be proven/revealed
/// to the contract when a new root is set; the metadata contains the range of nonces (and thus
/// number of ops) in the tree intended for the ManyChainMultiSig contract instance on which the
/// root is being set.
///
/// Once a root is registered, *anyone* is allowed to furnish proofs of op inclusion in the Merkle
/// tree and execute the corresponding op. The contract enforces that ops are executed in the
/// correct order and with the correct arguments. A notable exception to this is the gas limit of
/// the call, which can be freely determined by the executor. We expect (transitive) callees to
/// implement standard behavior of simply reverting if insufficient gas is provided. In particular,
/// this means callees should not have non-reverting gas-dependent branches.
///
/// Note: In the typical case, we expect the time from a root being set to all of the ops
/// therein having been executed to be on the order of a couple of minutes.

// --- Messages - incoming ---

/// Sets a new expiring root.
///
/// @param root is the new expiring root.
/// @param validUntil is the time by which root is valid
/// @param metadata is the authenticated metadata about the root, which is stored as one of
/// the leaves.
/// @param metadataProof is the MerkleProof of inclusion of the metadata in the Merkle tree.
/// @param signatures the ECDSA signatures on (root, validUntil).
///
/// @dev the message (root, validUntil) should be signed by a sufficient set of signers.
/// This signature authenticates also the metadata.
///
/// @dev this method can be executed by anyone who has the root and valid signatures.
/// as we validate the correctness of signatures, this imposes no risk.
struct (0xe7fabde3) MCMS_SetRoot {
    /// Query ID of the change request.
    queryId: uint64;

    /// The new expiring root.
    root: uint256;
    /// The time by which the root is valid.
    validUntil: uint64;

    /// The metadata about the root, which is stored as one of the leaves.
    metadata: RootMetadata;
    /// The MerkleProof of inclusion of the metadata in the Merkle tree.
    metadataProof: SnakedCell<uint256>;
    /// The ECDSA signatures on (root, validUntil).
    signatures: SnakedCell<Signature>;
}

/// Execute the received op after verifying the proof of its inclusion in the
/// current Merkle tree. The op should be the next op according to the order
/// enforced by the merkle tree whose root is stored in data.rootInfo.expiringRootAndOpCount, i.e., the
/// nonce of the op should be equal to data.rootInfo.expiringRootAndOpCount.opCount.
///
/// @param op is Op to be executed
/// @param proof is the MerkleProof for the op's inclusion in the MerkleTree which its
/// root is the data.rootInfo.expiringRootAndOpCount.root.
///
/// @dev ANYONE can call this function! That's intentional. Callers can only execute verified,
/// ordered ops in the Merkle tree.
///
/// @dev we perform a raw call to each target. Raw calls to targets that don't have associated
/// contract code will always succeed regardless of data.
///
/// @dev the gas limit of the call can be freely determined by the caller of this function.
/// We expect callees to revert if they run out of gas.
struct (0x9b9ce96a) MCMS_Execute {
    /// Query ID of the change request.
    queryId: uint64;

    /// The op to be executed.
    op: Cell<Op>; // @dev split out as cell to avoid size limits
    /// The MerkleProof for the op's inclusion in the MerkleTree
    proof: SnakedCell<uint256>;
}

/// Sets a new data.config. If clearRoot is true, then it also invalidates
/// data.rootInfo.expiringRootAndOpCount.root.
///
/// @param signerAddresses holds the EVM addresses of the active signers. The addresses must be in
/// ascending order.
/// @param signerGroups maps each signer to its group
/// @param groupQuorums holds the required number of valid signatures in each group.
/// A group i is called successful group if at least groupQuorum[i] distinct signers provide a
/// valid signature.
/// @param groupParents holds each group's parent. The groups must be arranged in a tree s.t.
/// group 0 is the root of the tree and the i-th group's parent has index j less than i.
/// Iff setRoot is called with a set of signatures that causes the root group to be successful,
/// setRoot allows a root to be set.
/// @param clearRoot, if set to true, invalidates the current root. This option is needed to
/// invalidate the current root, so to prevent further ops from being executed. This
/// might be used when the current root was signed under a loser group configuration or when
/// some previous signers aren't trusted any more.
struct (0x89277f4b) MCMS_SetConfig {
    /// Query ID of the change request.
    queryId: uint64;

    signerAddresses: SnakedCell<uint160>; // EVM addresses
    signerGroups: SnakedCell<uint8>;
    groupQuorums: map<uint8, uint8>; // indexed, iterable backwards
    groupParents: map<uint8, uint8>; // indexed, iterable backwards
    clearRoot: bool;
}

/// Changes the timeout required to finalize the currently executing op
///
/// Replies with {MCMS_OpFinalizationTimeoutChange} message.
///
/// Requirements:
///
/// - the caller must be the owner
struct (0x9dcbbab1) MCMS_UpdateOpFinalizationTimeout {
    /// Query ID of the change request.
    queryId: uint64;

    /// The timeout required to finalize the currently executing op
    newOpFinalizationTimeout: uint32;
}

/// Submit an oracle error report, which marks the current root as invalid.
///
/// The error report is used for a category of errors which might occur during execution
/// of an operation, but can't be caught on-chain (OOG errors, and downstream tx-trace errors).
///
/// @dev The error oracle can only report errors for the current non-expired root, to avoid reporting
/// stale errors for operations that are no longer valid.
struct (0x4b3af0b5) MCMS_SubmitErrorReport {
    /// Query ID of the change request.
    queryId: uint64;

    /// The operation which produced the MCMS_Error.
    op: Cell<Op>;
    /// The MerkleProof for the op's inclusion in the MerkleTree
    proof: SnakedCell<uint256>;
    /// The hash of the execute transaction.
    opTxHash: uint256;

    /// The hash of the transaction which errored (part of the tx trace).
    errorTxHash: uint256;
    /// The error code.
    errorCode: uint32;
}

/// Transfer the oracle role.
///
/// Replies with {MCMS_OracleRoleTransferred} message.
///
/// Requirements:
///
/// - the caller must be the owner
struct (0xf275742f) MCMS_TransferOracleRole {
    /// Query ID of the change request.
    queryId: uint64;

    /// The address of the new oracle.
    newOracle: address;
}

/// Delete expired roots from storage map to reduce rent
///
/// Replies with {MCMS_ExpiredRootsCleaned} message.
///
/// Requirements:
///
/// - the caller must be the owner
struct (0xa903c276) MCMS_CleanExpiredRoots {
    /// Query ID of the change request.
    queryId: uint64;

    /// The roots to clean up - RootDescriptor{root, validUntil}
    roots: SnakedCell<RootDescriptor>;
}

/// @dev Union of all incoming messages.
type MCMS_InMessage =
    | MCMS_SetRoot
    | MCMS_Execute
    | MCMS_SetConfig
    | MCMS_UpdateOpFinalizationTimeout
    | MCMS_SubmitErrorReport
    | MCMS_TransferOracleRole
    | MCMS_CleanExpiredRoots
    // when mcms owns itself (noop)
    | MCMS_ConfigSet
    | MCMS_OracleRoleTransferred
    | MCMS_ExpiredRootsCleaned;

// --- Messages - outgoing ---

/// Sent back to sender when a new root is set.
struct (0xa6533a3d) MCMS_NewRoot {
    /// Query ID of the change request.
    queryId: uint64;

    /// The new expiring root.
    root: uint256;
    /// The time by which the root is valid.
    validUntil: uint64;
    /// The metadata about the root, which is stored as one of the leaves.
    metadata: RootMetadata;
}

/// Sent back to sender when a new config is set.
struct (0xd80be574) MCMS_ConfigSet {
    /// Query ID of the change request.
    queryId: uint64;

    /// The new config.
    config: Config;
    /// Whether the root was cleared.
    isRootCleared: bool;
}

/// Sent back to sender when an op gets successfully executed.
struct (0x7cf37cbf) MCMS_OpExecuted {
    /// Query ID of the change request.
    queryId: uint64;

    /// The nonce of the operation.
    nonce: uint40;
    /// The address to which the operation is directed.
    to: address;
    /// The data to be sent with the operation.
    data: cell; // body
    /// The value to be sent with the operation.
    value: coins;
}

/// Replied to sender when the op finalization timeout is modified.
struct (0x16fc10e6) MCMS_OpFinalizationTimeoutChange {
    /// Query ID of the change request.
    queryId: uint64;

    /// Duration of the old timeout in seconds.
    oldDuration: uint32;
    /// Duration of the new timeout in seconds.
    newDuration: uint32;
}

/// Sent back to sender when an error report is successfully submitted.
struct (0xbbc4deb4) MCMS_ErrorReportSubmitted {
    /// Query ID of the change request.
    queryId: uint64;

    /// The (merkle leaf) hash of the operation which produced the MCMS_Error.
    opLeafHash: uint256;
    /// The hash of the operation execute transaction.
    opTxHash: uint256;

    /// The hash of the transaction which errored.
    errorTxHash: uint256;
    /// The error code.
    errorCode: uint32;

    /// The current root which was invalidated.
    root: Cell<uint256>;
    /// Whether the operation that was pending was the one for which the error was reported.
    matchesPendingOp: bool;
}

/// Sent back to sender when the oracle role is transferred.
struct (0xff4176a3) MCMS_OracleRoleTransferred {
    /// Query ID of the change request.
    queryId: uint64;
    /// The address of the old oracle.
    oldOracle: address;
    /// The address of the new oracle.
    newOracle: address;
}

/// Sent back to sender once roots are cleaned from storage
struct (0xa86846d5) MCMS_ExpiredRootsCleaned {
    /// Query ID of the change request.
    queryId: uint64;

    /// The cleaned up roots - RootDescriptor{root, validUntil}
    roots: SnakedCell<RootDescriptor>;
}

/// Emitted when a bounced message is handled.
struct (0xe695431e) MCMS_BounceHandled {
    /// The sender of the bounced message.
    sender: address;
    /// The truncated body of the bounced message.
    bouncedBody: uint256;
    /// The current root
    root: uint256;
    /// The current root op count (nonce).
    nonce: uint40;
    /// Whether the bounced message matched the pending op.
    matchesPendingOp: bool;
    /// Whether the bounce caused the root to be overridden.
    rootExpired: bool;
}

/// @dev Union of all outgoing messages.
type MCMS_OutMessage =
    | MCMS_NewRoot
    | MCMS_OpExecuted
    | MCMS_ConfigSet
    | MCMS_OpFinalizationTimeoutChange
    | MCMS_ErrorReportSubmitted
    | MCMS_OracleRoleTransferred
    | MCMS_ExpiredRootsCleaned
    | MCMS_BounceHandled;

// --- Storage ---

/// MCMS contract struct, host storage and runtime hooks (extensions).
struct MCMS<T> {
    data: MCMS_Data;

    /// Runtime hooks (extensions)
    context: T? = null;
    hooks: MCMS_Hooks<T>? = null;
}

/// MCMS contract storage, auto-serialized to/from cell.
struct MCMS_Data {
    /// ID allows multiple independent instances, since contract address depends on initial state.
    id: uint32;

    /// Ownable trait data
    ownable: Ownable2Step;

    /// Address of the error oracle account, which can submit error reports.
    oracle: address;

    /// signers is used to easily validate the existence of the signer by its EVM address. We still
    /// have signers stored in config in order to easily deactivate them when a new config is set.
    signers: map<uint160, Signer>; // exists if an EVM address is a signer

    /// The current configuration of the contract
    config: Cell<Config>; // @dev split out as cell to avoid size limits

    /// Remember signedHashes that this contract has seen. Each signedHash can only be set once.
    seenSignedHashes: map<uint256, bool>;

    /// The current RootMetadata and ExpiringRootAndOpCount wrapped in a cell bc size limits.
    rootInfo: Cell<RootInfo>;
}

/// Load from contract data using auto-serialization.
@inline
fun MCMS_Data.fromContractData() {
    return MCMS_Data.fromCell(contract.getData());
}

/// Store as contract data into persistent storage using auto-serialization.
@inline
fun MCMS_Data.storeAsContractData(self) {
    contract.setData(self.toCell());
}

// --- Hooks struct (extensions) ---

/// @dev Hook extensions exposed by the MCMS contract.
struct MCMS_Hooks<T> {
    /// Hook to inject custom execution logic.
    execute: ((T?, address, coins, cell) -> void)?;

    /// Hook to inject custom root encoding/hashing logic.
    hashRoot: ((T?, uint256, uint64) -> uint256)?;
}

// --- Constants ---

/// Should be used as the first 32 bytes of the pre-image of the leaf that holds a
/// op. This value is for domain separation of the different values stored in the
/// Merkle tree.
const MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP =
    stringSha256("MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP_TON");

/// Should be used as the first 32 bytes of the pre-image of the leaf that holds the
/// root metadata. This value is for domain separation of the different values stored in the
/// Merkle tree.
const MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA =
    stringSha256("MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA_TON");

const NUM_GROUPS = 32;
const MAX_NUM_SIGNERS = 200;

const TOPIC_BOUNCE_HANDLED = stringCrc32("MCMS_BounceHandled");

// --- Constants - storage ---

/// Represents the amount of TON coins we reserve on the balance to pay for storage fees.
const MIN_TON_TO_RESERVE: int = ton("0.05");

/// Error codes used by the Timelock contract.
enum MCMS_Error {
    /// Thrown when number of signers is 0 or greater than MAX_NUM_SIGNERS.
    OutOfBoundsNumSigners = 10400 // MCMS<T>.errorCode(0)

    /// Thrown when signerAddresses and signerGroups have different lengths.
    SignerGroupsLengthMismatch

    /// Thrown when number of some signer's group is greater than (NUM_GROUPS-1).
    OutOfBoundsGroup

    /// Thrown when the group tree isn't well-formed.
    GroupTreeNotWellFormed

    /// Thrown when the quorum of some group is larger than the number of signers in it.
    OutOfBoundsGroupQuorum

    /// Thrown when a disabled group contains a signer.
    SignerInDisabledGroup

    /// Thrown when the signers' EVM addresses are not a strictly increasing monotone sequence.
    /// Prevents signers from including more than one signature.
    SignersAdderssesMustBeStrictlyIncreasing

    /// Thrown when the signature corresponds to invalid signer.
    InvalidSigner

    /// Thrown when there is no sufficient set of valid signatures provided to make the
    /// root group successful.
    InsufficientSigners

    /// Thrown when attempt to set metadata or execute op for another chain.
    WrongChainId

    /// Thrown when the multiSig address in metadata or op is
    /// incompatible with the address of this contract.
    WrongMultiSig

    /// Thrown when the preOpCount <= postOpCount invariant is violated.
    WrongPostOpCount

    /// Thrown when attempting to set a new root while there are still pending ops
    /// from the previous root without explicitly overriding it.
    PendingOps

    /// Thrown when preOpCount in metadata is incompatible with the current opCount.
    WrongPreOpCount

    /// Thrown when the provided merkle proof cannot be verified.
    ProofCannotBeVerified

    /// Thrown when attempt to execute an op after
    /// data.rootInfo.expiringRootAndOpCount.validUntil has passed.
    RootExpired

    /// Thrown when attempt to bypass the enforced ops' order in the merkle tree or
    /// re-execute an op.
    WrongNonce

    /// Thrown when attempting to execute an op even though opCount equals
    /// metadata.postOpCount.
    PostOpCountReached

    /// Thrown when the underlying call in _execute() reverts.
    CallReverted

    /// Thrown when attempt to set past validUntil for the root.
    ValidUntilHasAlreadyPassed

    /// Thrown when setRoot() is called before setting a config.
    MissingConfig

    /// Thrown when attempt to set the same (root, validUntil) in setRoot().
    SignedHashAlreadySeen

    /// Thrown when the root has not been finalized yet (can't execute next op before finalization).
    RootNotFinalized

    /// Thrown when the provided op.value is insufficient (min required value not met).
    InsufficientValue

    /// Thrown when the error report sender is not the authorized oracle.
    UnauthorizedOracle

    /// Thrown when attempt to cleanup a non-expired root (validUntil has not passed)
    RootNotExpired

    /// Value attached to incoming message is not enough to pay for handler execution
    InsufficientFee
}

// --- Constants - storage ---

// --- Data structures ---

// Signer information
struct Signer {
    /// The EVM address of the signer.
    address: uint160;
    /// The index of the signer in data.config.signers
    index: uint8;
    /// 0 <= group < NUM_GROUPS. Each signer can only be in one group.
    group: uint8;
}

/// Signing groups are arranged in a tree. Each group is an interior node and has its own quorum.
/// Signers are the leaves of the tree. A signer/leaf node is successful iff it furnishes a valid
/// signature. A group/interior node is successful iff a quorum of its children are successful.
/// setRoot succeeds only if the root group is successful.
/// Here is an example:
///
///                    ┌──────┐
///                 ┌─►│2-of-3│◄───────┐
///                 │  └──────┘        │
///                 │        ▲         │
///                 │        │         │
///              ┌──┴───┐ ┌──┴───┐ ┌───┴────┐
///          ┌──►│1-of-2│ │2-of-2│ │signer A│
///          │   └──────┘ └──────┘ └────────┘
///          │       ▲      ▲  ▲
///          │       │      │  │     ┌──────┐
///          │       │      │  └─────┤1-of-2│◄─┐
///          │       │      │        └──────┘  │
///  ┌───────┴┐ ┌────┴───┐ ┌┴───────┐ ▲        │
///  │signer B│ │signer C│ │signer D│ │        │
///  └────────┘ └────────┘ └────────┘ │        │
///                                   │        │
///                            ┌──────┴─┐ ┌────┴───┐
///                            │signer E│ │signer F│
///                            └────────┘ └────────┘
///
/// - If signers [A, B] sign, they can set a root.
/// - If signers [B, D, E] sign, they can set a root.
/// - If signers [B, D, E, F] sign, they can set a root. (Either E's or F's signature was
///   superfluous.)
/// - If signers [B, C, D] sign, they cannot set a root, because the 2-of-2 group on the second
///   level isn't successful and therefore the root group isn't successful either.
///
/// To map this tree to a Config, we:
/// - create an entry in signers for each signer (sorted by address in ascending order)
/// - assign the root group to index 0 and have it be its own parent
/// - assign an index to each non-root group, such that each group's parent has a lower index
///   than the group itself
/// For example, we could transform the above tree structure into:
/// groupQuorums = [2, 1, 2, 1] + [0, 0, ...] (rightpad with 0s to NUM_GROUPS)
/// groupParents = [0, 0, 0, 2] + [0, 0, ...] (rightpad with 0s to NUM_GROUPS)
/// and assuming that address(A) < address(C) < address(E) < address(F) < address(D) < address(B)
/// signers = [
///    {addr: address(A), index: 0, group: 0}, {addr: address(C), index: 1, group: 1},
///    {addr: address(E), index: 2, group: 3}, {addr: address(F), index: 3, group: 3},
///    {addr: address(D), index: 4, group: 2}, {addr: address(B), index: 5, group: 1},
///  ]
struct Config {
    signers: map<uint8, Signer>; // indexed
    /// groupQuorums[i] stores the quorum for the i-th signer group. Any group with
    /// groupQuorums[i] = 0 is considered disabled. The i-th group is successful if
    /// it is enabled and at least groupQuorums[i] of its children are successful.
    groupQuorums: map<uint8, uint8>; // indexed, iterable backwards
    /// groupParents[i] stores the parent group of the i-th signer group. We ensure that the
    /// groups form a tree structure (where the root/0-th signer group points to itself as
    /// parent) by enforcing
    /// - (i != 0) implies (groupParents[i] < i)
    /// - groupParents[0] == 0
    groupParents: map<uint8, uint8>; // indexed, iterable backwards
}

/// Information about the current root, extracted into a separate struct (wrapped in a cell).
struct RootInfo {
    /// The current expiring root and the number of ops in it.
    expiringRootAndOpCount: ExpiringRootAndOpCount;
    /// The current metadata about the root.
    rootMetadata: RootMetadata;
}

/// MerkleRoots are a bit tricky since they reveal almost no information about the contents of
/// the tree they authenticate. To mitigate this, we enforce that this contract can only execute
/// ops from a single root at any given point in time. We further associate an expiry
/// with each root to ensure that messages are executed in a timely manner. setRoot and various
/// execute calls are expected to happen in quick succession. We put the expiring root and
/// opCount in same struct in order to reduce gas costs of reading and writing.
struct ExpiringRootAndOpCount {
    /// The expiring root.
    root: uint256;
    /// We prefer using block.timestamp instead of block.number, as a single
    /// root may target many chains. We assume that block.timestamp can
    /// be manipulated by block producers but only within relatively tight
    /// bounds (a few minutes at most).
    validUntil: uint64;
    /// each ManyChainMultiSig instance has it own independent opCount.
    opCount: uint40;
    /// Information about the currently pending operation.
    opPendingInfo: Cell<OpPendingInfo>
}

/// Information about the currently pending operation.
///
/// @dev TON-specific additional data required to support reliable execution in the async environment.
struct OpPendingInfo {
    /// The time at which the root becomes valid [executionTime(opCount - 1) + opFinalizationTimeout].
    /// At this time the previous executed operation is considered optimistically final and successful,
    /// meaning no bounce was received and we can continue executing.
    validAfter: uint64;
    /// The timeout required to finalize the currently executing op
    opFinalizationTimeout: uint32;
    /// The address that the (pending) operation was sent to (and could bounce from).
    opPendingReceiver: address?;
    /// The truncated body of the pending operation (256 bits from the original message),
    /// stored as the next expected potential bounce, and verified in onBounceMessage handler.
    opPendingBodyTruncated: uint256;
}

/// Each root also authenticates metadata about itself (stored as one of the leaves)
/// which must be revealed when the root is set.
///
/// @dev We need to be careful that abi.encode(MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA, RootMetadata)
/// is greater than 64 bytes to prevent collisions with internal nodes in the Merkle tree. See
/// openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol:15 for details.
struct RootMetadata {
    /// chainId and multiSig uniquely identify a ManyChainMultiSig contract instance that the
    /// root is destined for.
    /// int256 since it is unclear if we can represent chainId as uint64 (and TON introduces negative chain IDs).
    /// There is a proposal (https://ethereum-magicians.org/t/eip-2294-explicit-bound-to-chain-id/11090) to
    /// bound chainid to 64 bits, but it is still unresolved.
    chainId: int256;
    multiSig: address;
    // opCount before adding this root
    preOpCount: uint40;
    // opCount after executing all ops in this root
    postOpCount: uint40;
    // override whatever root was already stored in this contract even if some of its
    // ops weren't executed.
    // Important: it is strongly recommended that offchain code set this to false by default.
    // Be careful setting this to true as it may break assumptions about what transactions from
    // the previous root have already been executed. When true, bounce mismatches from
    // the displaced root are ignored (but emitted) instead of expiring the new root.
    overridePreviousRoot: bool;
}

/// An ECDSA secp256k1 signature.
struct Signature {
    v: uint8;
    r: uint256;
    s: uint256;
}

/// An op to be executed by the ManyChainMultiSig contract
///
/// @dev We need to be careful that abi.encode(LEAF_OP_DOMAIN_SEPARATOR, RootMetadata)
/// is greater than 64 bytes to prevent collisions with internal nodes in the Merkle tree. See
/// openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol:15 for details.
struct Op {
    chainId: int256;
    multiSig: address;
    nonce: uint40;
    to: address;
    value: coins;
    data: cell; // body of the operation
}

// Data container used to derive the root ID (hash)
struct RootDescriptor {
  // The merkle tree root
  root: uint256;
  // The time until which root is valid
  validUntil: uint64;
}

// --- Methods ---

/// Returns the error code for this facility and the given local code.
///     errorCode(0) == 10400
fun MCMS<T>.errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("link.chain.ton.mcms.MCMS"), local);
}

/// @dev Loads the MCMS contract data from persistent storage.
fun MCMS<T>.load(context: T? = null, hooks: MCMS_Hooks<T>? = null): MCMS<T> {
    // Load the contract data from the persistent storage
    var data = MCMS_Data.fromContractData();

    // Return the MCMS instance with loaded data and hooks
    return MCMS<T> {
        data: data,
        context: context,
        hooks: hooks,
    };
}

/// setRoot Sets a new expiring root.
///
/// @param root is the new expiring root.
/// @param validUntil is the time by which root is valid
/// @param metadata is the authenticated metadata about the root, which is stored as one of
/// the leaves.
/// @param metadataProof is the MerkleProof of inclusion of the metadata in the Merkle tree.
/// @param signatures the ECDSA signatures on (root, validUntil).
///
/// @dev the message (root, validUntil) should be signed by a sufficient set of signers.
/// This signature authenticates also the metadata.
///
/// @dev this method can be executed by anyone who has the root and valid signatures.
/// as we validate the correctness of signatures, this imposes no risk.
fun MCMS<T>.setRoot(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    root: uint256,
    validUntil: uint64,
    metadata: RootMetadata,
    metadataProof: SnakedCell<uint256>,
    signatures: SnakedCell<Signature>,
) {
    // Verify value covers the fee
    if (value < MCMS_Costs.setRoot()) {
        throw MCMS_Error.InsufficientFee;
    }

    if (validUntil < blockchain.now()) {
        throw MCMS_Error.ValidUntilHasAlreadyPassed;
    }

    // Construct the message that should be signed by the signers.
    val signedHash = self._hashRoot(root, validUntil);

    // Each (root, validUntil) tuple can only bet set once. For example, this prevents a
    // scenario where there are two signed roots with overridePreviousRoot = true and
    // an adversary keeps alternatively calling setRoot(root1), setRoot(root2),
    // setRoot(root1), ...
    {
        var r = self.data.seenSignedHashes.get(signedHash);
        if (r.isFound) {
            throw MCMS_Error.SignedHashAlreadySeen;
        }
    }

    // Upack config from the contract data
    var config = Config.fromCell(self.data.config);

    // the group at the root of the tree (with index 0) determines whether the vote passed,
    // we cannot proceed if it isn't configured with a valid (non-zero) quorum
    var rootQuorum: uint8;
    {
        var _rootQuorum = config.groupQuorums.get(0);
        if (!_rootQuorum.isFound) {
            throw MCMS_Error.MissingConfig;
        }
        rootQuorum = _rootQuorum.loadValue();
        if (rootQuorum == 0) {
            throw MCMS_Error.MissingConfig;
        }
    }

    {
        var i = 0;
        var signer: Signer;
        var prevSigner: uint256 = 0; // start with zero address
        var ss = signatures.iter();
        var groupVoteCounts: map<uint8, uint8> = createEmptyMap(); // number of votes per group, map<uint8, uint8> (indexed)
        while (!ss.empty()) {
            var s = ss.next();
            val signerAddress = evm_ecrecoverFrom(signedHash, s.toCell().beginParse());
            if (signerAddress == 0) {
                throw MCMS_Error.InvalidSigner;
            }

            // the off-chain system is required to sort the signatures by the
            // signer address in an increasing order
            if (prevSigner >= signerAddress) {
                throw MCMS_Error.SignersAdderssesMustBeStrictlyIncreasing;
            }
            prevSigner = signerAddress;

            {
                val _signer = self.data.signers.get(signerAddress);
                if (!_signer.isFound) {
                    throw MCMS_Error.InvalidSigner;
                }
                signer = _signer.loadValue();
            }

            if (signer.address != signerAddress) {
                throw MCMS_Error.InvalidSigner;
            }

            // @dev break/continue from loops are not supported yet in Tolk.
            // Instead, we use a flag to indicate whether we should break the loop.
            var _break = false;
            var group = signer.group;
            while (!_break) {
                var votes = 1;
                {
                    var current = groupVoteCounts.get(group);
                    if (current.isFound) {
                        votes = current.loadValue() + 1;
                    }
                }
                // Store the incremented vote count for the group
                groupVoteCounts.set(group, votes);

                var quorum = 0;
                {
                    var _quorum = config.groupQuorums.get(group);
                    if (_quorum.isFound) {
                        quorum = _quorum.loadValue();
                    }
                }

                if (votes != quorum) {
                    // bail out unless we just hit the quorum. we only hit each quorum once,
                    // so we never move on to the parent of a group more than once.
                    _break = true;
                }

                if (group == 0) {
                    // reached root
                    _break = true;
                }

                if (!_break) {
                    var parent = 0;
                    {
                        var _parent = config.groupParents.get(group);
                        if (_parent.isFound) {
                            parent = _parent.loadValue();
                        }
                    }

                    group = parent;
                }
            }
        }

        // did the root group reach its quorum?
        var _rootVotes = groupVoteCounts.get(0);
        if (!_rootVotes.isFound || _rootVotes.loadValue() < rootQuorum) {
            throw MCMS_Error.InsufficientSigners;
        }
    }

    {
        // verify metadataProof
        // @dev we use the standard sha256 hash function to hash the leaf.
        val hashedLeaf =
            beginCell()
                .storeUint(MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA, 256)
                .storeSlice(metadata.toCell().beginParse())
                .endCell()
                .hash();
        // "../lib/crypto/merkle_proof.tolk"
        if (!verify(metadataProof.iter(), root, hashedLeaf)) {
            throw MCMS_Error.ProofCannotBeVerified;
        }
    }

    // Check if right environment via chainId
    if (metadata.chainId != globalId() as int256) {
        throw MCMS_Error.WrongChainId;
    }

    if (metadata.multiSig != contract.getAddress()) {
        throw MCMS_Error.WrongMultiSig;
    }

    // Unpack the root info from the contract data
    val rootInfo = lazy RootInfo.fromCell(self.data.rootInfo);

    // don't allow a new root to be set if there are still outstanding ops that have not been
    // executed or finalized, unless the overridePreviousRoot flag is set
    val opCount: uint40 = rootInfo.expiringRootAndOpCount.opCount;
    val opPendingInfo = lazy OpPendingInfo.fromCell(rootInfo.expiringRootAndOpCount.opPendingInfo);
    if (!metadata.overridePreviousRoot) {
        if (blockchain.now() < opPendingInfo.validAfter) {
            throw MCMS_Error.RootNotFinalized;
        }
        if (opCount != rootInfo.rootMetadata.postOpCount) {
            throw MCMS_Error.PendingOps;
        }
    }

    // the signers are responsible for tracking opCount offchain and ensuring that
    // preOpCount equals to opCount
    if (opCount != metadata.preOpCount) {
        throw MCMS_Error.WrongPreOpCount;
    }

    if (metadata.preOpCount > metadata.postOpCount) {
        throw MCMS_Error.WrongPostOpCount;
    }

    // done with validation, persist in in contract state
    // Note: unbounded growth of the seen hashes map, unless cleaned with <MCMS_CleanExpiredRoots>
    self.data.seenSignedHashes.set(signedHash, true);
    self.data.rootInfo = RootInfo {
        expiringRootAndOpCount: ExpiringRootAndOpCount{
            root,
            validUntil,
            opCount: metadata.preOpCount,
            // TON-specific additions below to support the async environment
            opPendingInfo: OpPendingInfo{
                validAfter: blockchain.now(), // immediate
                opFinalizationTimeout: opPendingInfo.opFinalizationTimeout, // cp from storage
                opPendingReceiver: null,
                opPendingBodyTruncated: 0,
            }.toCell()
        },
        rootMetadata: metadata,
    }.toCell();

    // Reply to sender new root was set, return excess
    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: MCMS_NewRoot{queryId, root, validUntil, metadata}
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Execute the received op after verifying the proof of its inclusion in the
/// current Merkle tree. The op should be the next op according to the order
/// enforced by the merkle tree whose root is stored in data.rootInfo.expiringRootAndOpCount, i.e., the
/// nonce of the op should be equal to data.rootInfo.expiringRootAndOpCount.opCount.
///
/// @param op is Op to be executed
/// @param proof is the MerkleProof for the op's inclusion in the MerkleTree which its
/// root is the data.rootInfo.expiringRootAndOpCount.root.
///
/// @dev ANYONE can call this function! That's intentional. Callers can only execute verified,
/// ordered ops in the Merkle tree.
///
/// @dev we perform a raw call to each target. Raw calls to targets that don't have associated
/// contract code will always succeed regardless of data.
///
/// @dev the gas limit of the call can be freely determined by the caller of this function.
/// We expect callees to revert if they run out of gas.
fun MCMS<T>.execute(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    op: Op,
    proof: SnakedCell<uint256>,
) {
    // Verify value covers the fee
    if (value < MCMS_Costs.execute()) {
        throw MCMS_Error.InsufficientFee;
    }

    // Unpack the root info from the contract data
    val rootInfo = lazy RootInfo.fromCell(self.data.rootInfo);
    val currentExpiringRootAndOpCount = rootInfo.expiringRootAndOpCount;
    val rootMetadata = rootInfo.rootMetadata;

    if (rootMetadata.postOpCount <= currentExpiringRootAndOpCount.opCount) {
        throw MCMS_Error.PostOpCountReached;
    }

    // Check if right environment via chainId
    if (op.chainId != globalId() as int256) {
        throw MCMS_Error.WrongChainId;
    }

    if (op.multiSig != contract.getAddress()) {
        throw MCMS_Error.WrongMultiSig;
    }

    if (blockchain.now() > currentExpiringRootAndOpCount.validUntil) {
        throw MCMS_Error.RootExpired;
    }

    val opPendingInfo = lazy OpPendingInfo.fromCell(currentExpiringRootAndOpCount.opPendingInfo);
    if (blockchain.now() < opPendingInfo.validAfter) {
        throw MCMS_Error.RootNotFinalized;
    }

    if (op.nonce != currentExpiringRootAndOpCount.opCount) {
        throw MCMS_Error.WrongNonce;
    }

    // We enforce a minimum amount of TON op.value trying to ensure the receiver gets at least enough gas for
    // fee validation + a bounce, and avoid out of gas errors in which cases a message will not bounce.
    if (op.value < calculateGasFeeDefault()) {
        throw MCMS_Error.InsufficientValue;
    }

    // verify that the op exists in the merkle tree
    // @dev we use the standard sha256 hash function to hash the leaf.
    val hashedLeaf =
        beginCell()
            .storeUint(MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP, 256)
            .storeRef(op.toCell())
            .endCell()
            .hash();
    // "../lib/crypto/merkle_proof.tolk"
    if (!verify(proof.iter(), currentExpiringRootAndOpCount.root, hashedLeaf)) {
        throw MCMS_Error.ProofCannotBeVerified;
    }

    // Update the state
    self.data.rootInfo = RootInfo{
        expiringRootAndOpCount: {
            root: currentExpiringRootAndOpCount.root,
            validUntil: currentExpiringRootAndOpCount.validUntil,
            // increase the counter *before* execution to prevent reentrancy issues
            opCount: currentExpiringRootAndOpCount.opCount + 1,
            // TON-specific additions below to support the async environment
            opPendingInfo: OpPendingInfo{
                // @dev we set optimistic finalization of an async operation using a timeout
                // Within that timeout executions are paused as we wait for the finalization signal
                //
                // To finalize an execution, one of two conditions must be met:
                // 1. Finalization timeout expired                      [can continue]
                // 2. Message bounced back                              [can retry]
                // 3. Oracle reported an error (e.g., out-of-gas error) [root invalidated, can't retry]
                validAfter: blockchain.now() + opPendingInfo.opFinalizationTimeout,
                opFinalizationTimeout: opPendingInfo.opFinalizationTimeout,
                // Store the pending message info (checked onBouncedMessage)
                opPendingReceiver: op.to,
                opPendingBodyTruncated: extractBouncedBody(op.data.beginParse())
            }.toCell()
        },
        rootMetadata
    }.toCell();

    // We reserve some TON coins on the balance for rent
    val reserveMode = RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
    reserveToncoinsOnBalance(MIN_TON_TO_RESERVE, reserveMode);

    self._execute(op.to, op.value, op.data);

    // Reply back to sender
    val reply = createMessage({
        bounce: false,
        value: calculateGasFeeFor(FEE_SIZE_SMALL), // send small value as gas budget, keep the rest (payable)
        dest: sender,
        body: MCMS_OpExecuted{queryId, nonce: op.nonce, to: op.to, data: op.data, value: op.value}
    });
    reply.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

/// setConfig sets a new data.config. If clearRoot is true, then it also invalidates
/// data.rootInfo.expiringRootAndOpCount.root.
///
/// @param signerAddresses holds the EVM addresses of the active signers. The addresses must be in
/// ascending order.
/// @param signerGroups maps each signer to its group
/// @param groupQuorums holds the required number of valid signatures in each group.
/// A group i is called successful group if at least groupQuorum[i] distinct signers provide a
/// valid signature.
/// @param groupParents holds each group's parent. The groups must be arranged in a tree s.t.
/// group 0 is the root of the tree and the i-th group's parent has index j less than i.
/// Iff setRoot is called with a set of signatures that causes the root group to be successful,
/// setRoot allows a root to be set.
/// @param clearRoot, if set to true, invalidates the current root. This option is needed to
/// invalidate the current root, so to prevent further ops from being executed. This
/// might be used when the current root was signed under a loser group configuration or when
/// some previous signers aren't trusted any more.
fun MCMS<T>.setConfig(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    signerAddresses: SnakedCell<uint160>, // EVM addresses
    signerGroups: SnakedCell<uint8>,
    groupQuorums: map<uint8, uint8>, // indexed, iterable backwards
    groupParents: map<uint8, uint8>, // indexed, iterable backwards
    clearRoot: bool,
) {
    self.data.ownable.requireOwner(sender);

    // Verify value covers the fee
    if (value < MCMS_Costs.setConfig()) {
        throw MCMS_Error.InsufficientFee;
    }

    // Validate input lengths
    var signerAddrsIterator = signerAddresses.iter();
    val numSigners = signerAddrsIterator.size(20); // notice size in bytes
    if (numSigners == 0 || numSigners > MAX_NUM_SIGNERS) {
        throw MCMS_Error.OutOfBoundsNumSigners;
    }

    var signerGroupIterator = signerGroups.iter();
    if (numSigners != signerGroupIterator.size(1)) { // notice size in bytes
        throw MCMS_Error.SignerGroupsLengthMismatch;
    }

    {
        // Validate group structure
        // counts the number of children of each group
        var groupChildrenCounts: map<uint8, uint8> = createEmptyMap();
        // first, we count the signers as children
        while (!signerGroupIterator.empty()) {
            var g = signerGroupIterator.next();
            if (g >= NUM_GROUPS) {
                throw MCMS_Error.OutOfBoundsGroup;
            }

            var count = groupChildrenCounts.get(g);
            var value = 1;
            if (count.isFound) {
                value = count.loadValue() + 1;
            }
            groupChildrenCounts.set(g, value);
        }

        // second, we iterate backwards so as to check each group and propagate counts from
        // child group to parent groups up the tree to the root

        var j = 0;
        repeat(NUM_GROUPS) {
            val i = NUM_GROUPS - 1 - j;
            // ensure we have a well-formed group tree. the root should have itself as parent
            var gp = 0; // default parent for root group
            {
                var value = groupParents.get(i);
                if (value.isFound) {
                    gp = value.loadValue();
                }
            }
            if ((i != 0 && gp >= i) || (i == 0 && gp != 0)) {
                throw MCMS_Error.GroupTreeNotWellFormed;
            }

            var gq = 0; // default quorum for groups without a set quorum
            {
                var value = groupQuorums.get(i);
                if (value.isFound) {
                    gq = value.loadValue();
                }
            }

            val disabled = gq == 0;

            var count = 0; // default count
            {
                // get the number of children for this group
                var value = groupChildrenCounts.get(i);
                if (value.isFound) {
                    count = value.loadValue();
                }
            }

            if (disabled) {
                // a disabled group shouldn't have any children
                if (count > 0) {
                    throw MCMS_Error.SignerInDisabledGroup;
                }
            } else {
                // ensure that the group quorum can be met
                if (count < gq) {
                    throw MCMS_Error.OutOfBoundsGroupQuorum;
                }

                var current = 0;
                {
                   var value = groupChildrenCounts.get(gp);
                   if (value.isFound) {
                       current = value.loadValue();
                   }
                }
                groupChildrenCounts.set(gp, current + 1);
                // the above line clobbers groupChildrenCounts[0] in last iteration, don't use it after the loop ends
            }

            // Increment j until we reach the last group
            j += 1;
        }
    }

    // Upack config from the contract data
    var config = Config.fromCell(self.data.config);
    // Iterate over and remove old signers
    var oldSigner = config.signers.findFirst();
    while (oldSigner.isFound) {
        val s = oldSigner.loadValue();
        // Remove any old signer addresses
        config.signers.delete(oldSigner.getKey());
        self.data.signers.delete(s.address);
        oldSigner = config.signers.findFirst();
    }
    config.signers = createEmptyMap(); // reset signers

    config.groupQuorums = groupQuorums;
    config.groupParents = groupParents;

    // add new signers' addresses, we require that the signers' list be a strictly monotone
    // increasing sequence
    var i = 0;
    var prevSigner: uint160 = 0; // start with a zero key
    // Reset the signers group iterator
    signerGroupIterator = signerGroups.iter();
    while (!signerAddrsIterator.empty()) {
        var address = signerAddrsIterator.next();
        if (prevSigner >= address) {
            throw MCMS_Error.SignersAdderssesMustBeStrictlyIncreasing;
        }

        val group = signerGroupIterator.next();
        var signer = Signer{address, index: i as uint8, group: group};
        self.data.signers.set(address, signer);
        config.signers.set(i, signer);

        prevSigner = address;

        // Increment i for the next signer
        i += 1;
    }

    // Pack the config back into a data cell
    self.data.config = config.toCell();

    // Optionally clear root
    if (clearRoot) {
        // clearRoot is equivalent to overriding with a completely empty root
        val rootInfo = lazy RootInfo.fromCell(self.data.rootInfo);
        val opCount = rootInfo.expiringRootAndOpCount.opCount;
        val opPendingInfo = lazy OpPendingInfo.fromCell(rootInfo.expiringRootAndOpCount.opPendingInfo);

        self.data.rootInfo = RootInfo{
            expiringRootAndOpCount: ExpiringRootAndOpCount{
                root: 0, // empty root
                validUntil: 0,
                opCount,
                // TON-specific additions below to support the async environment
                opPendingInfo: OpPendingInfo{
                    validAfter: blockchain.now(), // immediate
                    opFinalizationTimeout: opPendingInfo.opFinalizationTimeout, // cp from storage
                    opPendingReceiver: null,
                    opPendingBodyTruncated: 0
                }.toCell()
            },
            rootMetadata: RootMetadata{
                chainId: globalId() as int256,
                multiSig: contract.getAddress(),
                preOpCount: opCount,
                postOpCount: opCount,
                overridePreviousRoot: true
            }
        }.toCell();
    }

    // Reply to sender config is set, return excess
    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: MCMS_ConfigSet{ queryId, config, isRootCleared: clearRoot }
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Changes the timeout required to finalize the currently executing op
/// @see {MCMS_UpdateOpFinalizationTimeout} for more information.
fun MCMS<T>.updateOpFinalizationTimeout(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    newOpFinalizationTimeout: uint32
): void {
    self.data.ownable.requireOwner(sender);

    // Unpack the root info from the contract data
    var rootInfo = RootInfo.fromCell(self.data.rootInfo);
    var opPendingInfo = OpPendingInfo.fromCell(rootInfo.expiringRootAndOpCount.opPendingInfo);

    // Set the pending operation finalization timeout (if exists and shorter than current)
    val currTimeout = opPendingInfo.opFinalizationTimeout;
    if (opPendingInfo.opPendingReceiver != null && newOpFinalizationTimeout < currTimeout) {
        opPendingInfo.validAfter = opPendingInfo.validAfter - currTimeout + newOpFinalizationTimeout;
    }

    // Update the op finalization timeout
    opPendingInfo.opFinalizationTimeout = newOpFinalizationTimeout;

    // Update the info for the pending op, store the new root info
    rootInfo.expiringRootAndOpCount.opPendingInfo = opPendingInfo.toCell();
    self.data.rootInfo = rootInfo.toCell();

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: MCMS_OpFinalizationTimeoutChange{ queryId, oldDuration: currTimeout, newDuration: newOpFinalizationTimeout}
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Submit an oracle error report, which marks the current root as invalid.
///
/// @see <MCMS_SubmitErrorReport> for more information.
fun MCMS<T>.submitErrorReport(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    op: Op,
    proof: SnakedCell<uint256>,
    opTxHash: uint256,
    errorTxHash: uint256,
    errorCode: uint32
) {
    // Only the oracle can submit error reports
    if (sender != self.data.oracle) {
        throw MCMS_Error.UnauthorizedOracle;
    }

    // Verify value covers the fee
    if (value < MCMS_Costs.submitErrorReport()) {
        throw MCMS_Error.InsufficientFee;
    }

    // Check if right environment via chainId
    if (op.chainId != globalId() as int256) {
        throw MCMS_Error.WrongChainId;
    }

    if (op.multiSig != contract.getAddress()) {
        throw MCMS_Error.WrongMultiSig;
    }

    var rootInfo = lazy RootInfo.fromCell(self.data.rootInfo);

    // Can only report errors against active root - verify op exists in the merkle tree
    // @dev we use the standard sha256 hash function to hash the leaf.
    val hashedLeaf =
        beginCell()
            .storeUint(MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP, 256)
            .storeRef(op.toCell())
            .endCell()
            .hash();
    // "../lib/crypto/merkle_proof.tolk"
    if (!verify(proof.iter(), rootInfo.expiringRootAndOpCount.root, hashedLeaf)) {
        throw MCMS_Error.ProofCannotBeVerified;
    }

    // Mark root in error state (recover with new root + bypass)
    if (blockchain.now() < rootInfo.expiringRootAndOpCount.validUntil) {
        // expire root immediately, if not already expired
        rootInfo.expiringRootAndOpCount.validUntil = blockchain.now() - 1;
        self.data.rootInfo = rootInfo.toCell();
    }

    // Check the reported error against the stored pending operation
    val opPendingInfo = lazy OpPendingInfo.fromCell(rootInfo.expiringRootAndOpCount.opPendingInfo);

    val matchesPendingOp = true
        && opPendingInfo.opPendingReceiver != null
        && opPendingInfo.opPendingReceiver == op.to
        && opPendingInfo.opPendingBodyTruncated == extractBouncedBody(op.data.beginParse());

    // Store the root in a separate cell (size limit)
    val root = beginCell()
        .storeUint(rootInfo.expiringRootAndOpCount.root, 256)
        .endCell() as Cell<uint256>;

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: MCMS_ErrorReportSubmitted{
            queryId,
            opLeafHash: hashedLeaf,
            opTxHash,
            errorTxHash,
            errorCode,
            root,
            matchesPendingOp,
        }
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Transfer the error oracle role - requires owner.
///
/// @see <MCMS_TransferOracleRole> for more information.
fun MCMS<T>.transferOracleRole(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    newOracle: address
) {
    self.data.ownable.requireOwner(sender);

    val oldOracle = self.data.oracle;
    self.data.oracle = newOracle;

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: MCMS_OracleRoleTransferred{ queryId, oldOracle, newOracle }
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Delete expired roots from storage map to reduce (accumulated) rent - requires owner.
///
/// @see <MCMS_CleanExpiredRoots> for more information.
fun MCMS<T>.cleanExpiredRoots(
    mutate self,
    sender: address,
    value: coins,
    queryId: uint64,
    roots: SnakedCell<RootDescriptor>,
) {
    self.data.ownable.requireOwner(sender);

    var rootsIter = roots.iter();
    while (!rootsIter.empty()) {
        val rd = rootsIter.next();
        assert(rd.validUntil < blockchain.now()) throw MCMS_Error.RootNotExpired;

        /// Construct the ID (hash) of the root
        val signedHash = self._hashRoot(rd.root, rd.validUntil);
        self.data.seenSignedHashes.delete(signedHash);
    }

    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: MCMS_ExpiredRootsCleaned{queryId, roots}
    });
    reply.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Execute an op's call. Performs a raw message send that can bounce on errors.
fun MCMS<T>._execute(self, dest: address, value: coins, body: cell): void {
    if (self.hooks != null && self.hooks.execute != null) {
        return self.hooks.execute(self.context, dest, value, body); // extension hook
    }

    // Send a message to the target with the provided value and data
    val op = createMessage({bounce: true, value, dest, body});
    op.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

/// Encode and hash a root with its validUntil timestamp (EIP191 + keccak256)
fun MCMS<T>._hashRoot(self, root: uint256, validUntil: uint64): uint256 {
    if (self.hooks != null && self.hooks.hashRoot != null) {
        return self.hooks.hashRoot(self.context, root, validUntil); // extension hook
    }

    // ABI encode root (uint256) and validUntil (uint64 padded to 256 bits)
    // This matches: abi.encode(root, validUntil)
    val data = beginCell()
        .storeUint(root, 256)
        .storeUint(validUntil as uint256, 256);
    val _hash = keccak256(data);

    // EIP191 Signed Message Hash wrapping
    // Format: "\x19Ethereum Signed Message:\n32" + messageHash
    val eip191Prefix = stringHexToSlice("19457468657265756d205369676e6564204d6573736167653a0a3332");
    val eip191Data = beginCell()
        .storeSlice(eip191Prefix)
        .storeUint(_hash, 256);

    return keccak256(eip191Data);
}

/// Returns the id that derives the (contract) address of this MCMS instance.
fun MCMS<T>.getId(self): uint32 {
    return self.data.id;
}

/// Returns the current configuration of the contract
fun MCMS<T>.getConfig(self): Config {
    return Config.fromCell(self.data.config);
}

/// Returns the current op count, i.e., the number of ops in the current expiring root.
fun MCMS<T>.getOpCount(self): uint40 {
    val rootInfo = lazy RootInfo.fromCell(self.data.rootInfo);
    return rootInfo.expiringRootAndOpCount.opCount;
}

/// Returns the current expiring root and its validUntil time.
fun MCMS<T>.getRoot(self): (uint256, uint64) {
    val rootInfo = lazy RootInfo.fromCell(self.data.rootInfo);
    return (rootInfo.expiringRootAndOpCount.root, rootInfo.expiringRootAndOpCount.validUntil);
}

/// Returns the current pending operation information.
fun MCMS<T>.getOpPendingInfo(self): OpPendingInfo {
    val rootInfo = lazy RootInfo.fromCell(self.data.rootInfo);
    return OpPendingInfo.fromCell(rootInfo.expiringRootAndOpCount.opPendingInfo);
}

/// Returns the current metadata about the root, which is stored as one of the leaves.
fun MCMS<T>.getRootMetadata(self): RootMetadata {
    return RootInfo.fromCell(self.data.rootInfo).rootMetadata;
}

/// Returns the current oracle account, which can submit error reports.
fun MCMS<T>.getOracle(self): address {
    return self.data.oracle;
}

// --- Message handlers ---

@inline
fun MCMS<T>.onInternalMessage(mutate self, msgSender: address, msgValue: coins, msgBody: slice) {
    val msg = lazy MCMS_InMessage.fromSlice(msgBody);
    match (msg) {
        MCMS_SetRoot => {
            self.setRoot(msgSender, msgValue, msg.queryId, msg.root, msg.validUntil, msg.metadata,
                msg.metadataProof, msg.signatures);
        }
        MCMS_Execute => {
            self.execute(msgSender, msgValue, msg.queryId, msg.op.load(), msg.proof);
        }
        MCMS_SetConfig => {
            self.setConfig(msgSender, msgValue, msg.queryId, msg.signerAddresses, msg.signerGroups,
                msg.groupQuorums, msg.groupParents, msg.clearRoot);
        }
        MCMS_UpdateOpFinalizationTimeout => {
            self.updateOpFinalizationTimeout(msgSender, msgValue, msg.queryId, msg.newOpFinalizationTimeout);
        }
        MCMS_SubmitErrorReport => {
            self.submitErrorReport(msgSender, msgValue, msg.queryId, msg.op.load(),
                msg.proof, msg.opTxHash, msg.errorTxHash, msg.errorCode);
        }
        MCMS_TransferOracleRole => {
            self.transferOracleRole(msgSender, msgValue, msg.queryId, msg.newOracle);
        }
        MCMS_CleanExpiredRoots => {
            self.cleanExpiredRoots(msgSender, msgValue, msg.queryId, msg.roots);
        }
        // noop handlers (expected replies for ownable ops when owning self)
        MCMS_OracleRoleTransferred => {
            // noop
        }
        MCMS_ConfigSet => {
            // noop
        },
        MCMS_ExpiredRootsCleaned => {
            // noop
        }
        else => {
            val _msgHandled = 0
                || self.data.ownable.onInternalMessage(msgSender, msgBody);

            // Notice: allow empty message (top up)
            // @dev Contract might receive/hold TON as part of the maintenance process.

            // If the message was not handled:
            //  - ignore all other messages, empty or not empty
            //  - accept generic replies, don't throw "wrong opcode"
        }
    }
}

fun onInternalMessage(in: InMessage) {
    // Load the contract storage as MCMS and handle the message
    var mcms = MCMS<bool>.load();
    mcms.onInternalMessage(in.senderAddress, in.valueCoins, in.body);

    // Store the updated contract data
    mcms.data.storeAsContractData();
}

// Handle bounced messages from executed ops.
//
// On bounce, any bounced value is kept/stored in the MCMS contract and can be withdrawn with
// subsequent proposals. Every bounce emits MCMS_BounceHandled for observability.
fun onBouncedMessage(in: InMessageBounced) {
    // Load the contract storage as MCMS and handle the bounced message
    var mcms = MCMS<bool>.load();

    var rootInfo = lazy RootInfo.fromCell(mcms.data.rootInfo);
    var opPendingInfo = lazy OpPendingInfo.fromCell(rootInfo.expiringRootAndOpCount.opPendingInfo);

    // Note: make sure opFinalizationTimeout is a large enough value to avoid races here.
    // Check the bounced message against the stored pending operation. If the bounce matches the currently
    // pending op treat it as a retry signal. Otherwise, expire the root based on conditions below.
    val bouncedBody = extractBouncedBody(in.bouncedBody.skipBouncedPrefix());
    val root = rootInfo.expiringRootAndOpCount.root;
    val nonce = rootInfo.expiringRootAndOpCount.opCount;

    val matchesPendingOp = true
        && opPendingInfo.opPendingReceiver != null
        && opPendingInfo.opPendingReceiver! == in.senderAddress
        && opPendingInfo.opPendingBodyTruncated == bouncedBody;

    if (!matchesPendingOp) {
        // A bounce that doesn't match the stored pending op may be:
        //   1. a delayed bounce from a previous root (at most one op executed under new root)
        //     - expire the root or ignore if overridePreviousRoot set
        //   2. a delayed bounce from a previous op in the current root
        //     - expire the root
        val ignoreMismatchedBounce = true
            && rootInfo.rootMetadata.overridePreviousRoot // quorum overrides any prev root errors/bounces
            && (nonce == rootInfo.rootMetadata.preOpCount || nonce == rootInfo.rootMetadata.preOpCount + 1);

        if (ignoreMismatchedBounce) {
            emit(TOPIC_BOUNCE_HANDLED, MCMS_BounceHandled{
                sender: in.senderAddress,
                bouncedBody,
                root,
                nonce,
                matchesPendingOp,
                rootExpired: false, // root remains valid to continue
            });
            return;
        }

        // Mark root in error state (recover with new root + bypass)
        rootInfo.expiringRootAndOpCount.validUntil = blockchain.now() - 1; // expire root immediately
        mcms.data.rootInfo = rootInfo.toCell();
        mcms.data.storeAsContractData();

        emit(TOPIC_BOUNCE_HANDLED, MCMS_BounceHandled{
            sender: in.senderAddress,
            bouncedBody,
            root,
            nonce,
            matchesPendingOp,
            rootExpired: true,
        });
        return;
    }

    // If the received bounce equals expected, revert state (allow op retry)
    rootInfo.expiringRootAndOpCount.opCount = nonce - 1;
    opPendingInfo.validAfter = blockchain.now(); // can be retried immediately
    opPendingInfo.opPendingReceiver = null;
    opPendingInfo.opPendingBodyTruncated = 0;

    rootInfo.expiringRootAndOpCount.opPendingInfo = opPendingInfo.toCell();
    mcms.data.rootInfo = rootInfo.toCell();
    mcms.data.storeAsContractData();

    emit(TOPIC_BOUNCE_HANDLED, MCMS_BounceHandled{
        sender: in.senderAddress,
        bouncedBody,
        root,
        nonce,
        matchesPendingOp,
        rootExpired: false, // root remains valid for retry
    });
}

// --- Costs ---

struct MCMS_Costs{}

fun MCMS_Costs.setRoot(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // MCMS_NewRoot fwdFee (reply)
        + calculateGasFeeFor(FEE_SIZE_SMALL) // reply value
        ;
}

// Notice: execute caller is expected to pay for the processing fees,
// while the rest (rent, op.value) is paid/reserved by the contract.
fun MCMS_Costs.execute(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // message executed/sent fwdFee
        + 0            // op.value is reserved by the contract
        + ton("0.019") // MCMS_OpExecuted fwdFee (reply)
        + calculateGasFeeFor(FEE_SIZE_SMALL) // reply value
        ;
}

fun MCMS_Costs.setConfig(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // MCMS_ConfigSet fwdFee (reply)
        + calculateGasFeeFor(FEE_SIZE_SMALL) // reply value
        ;
}

fun MCMS_Costs.submitErrorReport(): int {
    return
        + ton("0.002") // computeFee
        + ton("0.019") // MCMS_ErrorReportSubmitted fwdFee (reply)
        + calculateGasFeeFor(FEE_SIZE_SMALL) // reply value
        ;
}

// --- Getters ---

get fun typeAndVersion(): (slice, slice) {
    return ("link.chain.ton.mcms.MCMS", CONTRACT_VERSION);
}

/// @see <MCMS<T>.getId>
get fun getId(): uint32 {
    return MCMS<bool>.load().getId();
}

/// @see <MCMS<T>.getConfig>
get fun getConfig(): Config {
    return MCMS<bool>.load().getConfig();
}

/// @see <MCMS<T>.getOpCount>
get fun getOpCount(): uint40 {
    return MCMS<bool>.load().getOpCount();
}

/// @see <MCMS<T>.getRoot>
get fun getRoot(): (uint256, uint64) {
    return MCMS<bool>.load().getRoot();
}

/// @see <MCMS<T>.getOpPendingInfo>
get fun getOpPendingInfo(): OpPendingInfo {
    return MCMS<bool>.load().getOpPendingInfo();
}

/// @see <MCMS<T>.getRootMetadata>
get fun getRootMetadata(): RootMetadata {
    return MCMS<bool>.load().getRootMetadata();
}

/// @see <MCMS<T>.getOracle>
get fun getOracle(): address {
    return MCMS<bool>.load().getOracle();
}

// --- Getters - Ownable2Step ---

/// @see <Ownable2Step.get_owner>
get fun owner(): address {
    return MCMS<bool>.load().data.ownable.get_owner();
}

/// @see <Ownable2Step.get_pendingOwner>
get fun pendingOwner(): address? {
    return MCMS<bool>.load().data.ownable.get_pendingOwner();
}
