import {
  Address,
  beginCell,
  Builder,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
  Slice,
} from '@ton/core'
import { crc32 } from 'zlib'
import { CellCodec, sha256_32 } from '../utils'
import { asSnakeData, fromSnakeData, ZERO_ADDRESS } from '../../src/utils'
import * as ownable2step from '../libraries/access/Ownable2Step'
import { loadDict, loadMap } from '../../src/utils/dict'

// @dev Top up contract with TON coins.
export type TopUp = {
  // Query ID of the change request.
  queryId: bigint
}

// @dev Sets a new expiring root.
export type SetRoot = {
  // Query ID of the change request.
  queryId: bigint

  // The new expiring root.
  root: bigint // uint256
  // The time by which the root is valid.
  validUntil: bigint // uint32
  // The metadata about the root, which is stored as one of the leaves.
  metadata: RootMetadata
  // The MerkleProof of inclusion of the metadata in the Merkle tree.
  metadataProof: Cell // vec<uint256>
  // The ECDSA signatures on (root, validUntil).
  signatures: Cell // vec<Signature>
  /// The timeout required to finalize the currently executing op
  opFinalizationTimeout: bigint // uint32
}

// @dev Executes an operation authenticated by the Merkle tree.
export type Execute = {
  // Query ID of the execute request.
  queryId: bigint

  // The operation to be executed, stored as a Cell to avoid size limits.
  op: Cell // Cell<Op>
  // The Merkle proof for the op's inclusion in the Merkle tree.
  proof: bigint[] // vec<uint256>
}

// @dev Sets the configuration for the contract.
export type SetConfig = {
  // Query ID of the change request.
  queryId: bigint

  // List of signer public keys.
  signerKeys: bigint[] // vec<uint256>
  // List of signer groups.
  signerGroups: number[] // vec<uint8>
  // List of group quorums.
  groupQuorums: Map<number, number> // map<uint8, uint8> (indexed, iterable backwards)
  // List of group parents.
  groupParents: Map<number, number> // map<uint8, uint8> (indexed, iterable backwards)
  // Whether to clear the current root.
  clearRoot: boolean
}

/// Submit an oracle error report, which marks the current root as invalid.
///
/// The error report is used for a category of errors which might occur during execution
/// of an operation, but can't be caught on-chain (OOG errors, and downstream tx-trace errors).
///
/// @dev The error oracle can only report errors for the current non-expired root, to avoid reporting
/// stale errors for operations that are no longer valid.
export type SubmitErrorReport = {
  /// Query ID of the change request.
  queryId: bigint

  /// The operation which produced the error.
  op: Cell // Cell<Op>
  /// The MerkleProof for the op's inclusion in the MerkleTree
  proof: bigint[] // vec<uint256>,
  /// The hash of the execute transaction.
  opTxHash: bigint

  /// The hash of the transaction which errored (part of the tx trace).
  errorTxHash: bigint
  /// The error code.
  errorCode: number
}

/// Message sent by the owner to transfer the oracle role.
export type TransferOracleRole = {
  /// Query ID of the change request.
  queryId: bigint
  /// The address of the new oracle.
  newOracle: Address
}

// @dev Union of all (input) messages.
export type InMessage =
  | TopUp
  | SetRoot
  | Execute
  | SetConfig
  | SubmitErrorReport
  | TransferOracleRole

// MCMS contract storage
export type ContractData = {
  /// ID allows multiple independent instances, since contract address depends on initial state.
  id: number // uint32

  /// Ownable trait data
  ownable: ownable2step.Data
  /// Address of the error oracle account, which can submit error reports.
  oracle: Address
  /// Map where entry exists if the public key is a signer
  signers: Map<bigint, Buffer> // map<uint256, Signer>
  /// The current configuration of the contract
  config: Config

  /// Remember signedHashes that this contract has seen. Each signedHash can only be set once.
  seenSignedHashes: Map<bigint, boolean> // map<uint256, bool>
  /// The current RootMetadata and ExpiringRootAndOpCount wrapped in a cell bc size limits.
  rootInfo: RootInfo
}

// --- Constants ---

/// Should be used as the first 32 bytes of the pre-image of the leaf that holds a
/// op. This value is for domain separation of the different values stored in the
/// Merkle tree.
export const MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP = sha256_32(
  'MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP',
)

/// Should be used as the first 32 bytes of the pre-image of the leaf that holds the
/// root metadata. This value is for domain separation of the different values stored in the
/// Merkle tree.
export const MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA = sha256_32(
  'MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA',
)

export const NUM_GROUPS = 32
export const MAX_NUM_SIGNERS = 200

export enum Error {
  /// Thrown when number of signers is 0 or greater than MAX_NUM_SIGNERS.
  OUT_OF_BOUNDS_NUM_SIGNERS = 100,

  /// Thrown when signerKeys and signerGroups have different lengths.
  SIGNER_GROUPS_LENGTH_MISMATCH = 101,

  /// Thrown when number of some signer's group is greater than (NUM_GROUPS-1).
  OUT_OF_BOUNDS_GROUP = 102,

  /// Thrown when the group tree isn't well-formed.
  GROUP_TREE_NOT_WELL_FORMED = 103,

  /// Thrown when the quorum of some group is larger than the number of signers in it.
  OUT_OF_BOUNDS_GROUP_QUORUM = 104,

  /// Thrown when a disabled group contains a signer.
  SIGNER_IN_DISABLED_GROUP = 105,

  /// Thrown when the signers' public keys are not a strictly increasing monotone sequence.
  /// Prevents signers from including more than one signature.
  SIGNERS_KEYS_MUST_BE_STRICTLY_INCREASING = 106,

  /// Thrown when the signature corresponds to invalid signer.
  INVALID_SIGNER = 107,

  /// Thrown when there is no sufficient set of valid signatures provided to make the
  /// root group successful.
  INSUFFICIENT_SIGNERS = 108,

  /// Thrown when attempt to set metadata or execute op for another chain.
  WRONG_CHAIN_ID = 109,

  /// Thrown when the multiSig address in metadata or op is
  /// incompatible with the address of this contract.
  WRONG_MULTI_SIG = 110,

  /// Thrown when the preOpCount <= postOpCount invariant is violated.
  WRONG_POST_OP_COUNT = 111,

  /// Thrown when attempting to set a new root while there are still pending ops
  /// from the previous root without explicitly overriding it.
  PENDING_OPS = 112,

  /// Thrown when preOpCount in metadata is incompatible with the current opCount.
  WRONG_PRE_OP_COUNT = 113,

  /// Thrown when the provided merkle proof cannot be verified.
  PROOF_CANNOT_BE_VERIFIED = 114,

  /// Thrown when attempt to execute an op after
  /// s_expiringRootAndOpCount.validUntil has passed.
  ROOT_EXPIRED = 115,

  /// Thrown when attempt to bypass the enforced ops' order in the merkle tree or
  /// re-execute an op.
  WRONG_NONCE = 116,

  /// Thrown when attempting to execute an op even though opCount equals
  /// metadata.postOpCount.
  POST_OP_COUNT_REACHED = 117,

  /// Thrown when the underlying call in _execute() reverts.
  CALL_REVERTED = 118,

  /// Thrown when attempt to set past validUntil for the root.
  VALID_UNTIL_HAS_ALREADY_PASSED = 119,

  /// Thrown when setRoot() is called before setting a config.
  MISSING_CONFIG = 120,

  /// Thrown when attempt to set the same (root, validUntil) in setRoot().
  SIGNED_HASH_ALREADY_SEEN = 121,

  /// Thrown when the root has not been finalized yet (can't execute next op before finalization).
  ERROR_ROOT_NOT_FINALIZED = 122,

  /// Thrown when the provided op.value is insufficient (min required value not met).
  ERROR_INSUFFICIENT_VALUE = 123,

  /// Thrown when the error report sender is not the authorized oracle.
  ERROR_UNAUTHORIZED_ORACLE = 124,
}

// --- Data structures ---

// Length of serialized signer structure in bytes.
export const LEN_SIGNER_BYTES = (256 + 8 + 8) / 8

// Signer information
export type Signer = {
  // The public key of the signer.
  key: bigint // uint256;
  // The index of the signer in data.config.signers
  index: number // 0 <= index < MAX_NUM_SIGNERS
  // 0 <= group < NUM_GROUPS. Each signer can only be in one group.
  group: number
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
// Configuration structure for the contract
export type Config = {
  // Map of signer indices to Signer objects (indexed)
  signers: Map<number, Buffer> // map<uint8, Signer> - (indexed)
  // groupQuorums[i] stores the quorum for the i-th signer group. Any group with
  // groupQuorums[i] = 0 is considered disabled. The i-th group is successful if
  // it is enabled and at least groupQuorums[i] of its children are successful.
  groupQuorums: Map<number, number> // map<uint8, uint8> (indexed, iterable backwards)
  // groupParents[i] stores the parent group of the i-th signer group. We ensure that the
  // groups form a tree structure (where the root/0-th signer group points to itself as
  // parent) by enforcing:
  // - (i != 0) implies (groupParents[i] < i)
  // - groupParents[0] == 0
  groupParents: Map<number, number> // map<uint8, uint8> (indexed, iterable backwards)
}

/// Information about the current root, extracted into a separate struct (wrapped in a cell).
export type RootInfo = {
  /// The current expiring root and the number of ops in it.
  expiringRootAndOpCount: ExpiringRootAndOpCount
  /// The current metadata about the root.
  rootMetadata: RootMetadata
}

/// MerkleRoots are a bit tricky since they reveal almost no information about the contents of
/// the tree they authenticate. To mitigate this, we enforce that this contract can only execute
/// ops from a single root at any given point in time. We further associate an expiry
/// with each root to ensure that messages are executed in a timely manner. setRoot and various
/// execute calls are expected to happen in quick succession. We put the expiring root and
/// opCount in same struct in order to reduce gas costs of reading and writing.
export type ExpiringRootAndOpCount = {
  /// The expiring root.
  root: bigint // uint256
  /// We prefer using block.timestamp instead of block.number, as a single
  /// root may target many chains. We assume that block.timestamp can
  /// be manipulated by block producers but only within relatively tight
  /// bounds (a few minutes at most).
  validUntil: bigint //uint32
  /// each ManyChainMultiSig instance has it own independent opCount.
  opCount: bigint // uint40
  /// Information about the currently pending operation.
  opPendingInfo: OpPendingInfo
}

/// Information about the currently pending operation.
/// This is TON-specific additional data required to support reliable execution in the async environment.
export type OpPendingInfo = {
  /// The time at which the root becomes valid [executionTime(opCount - 1) + opFinalizationTimeout].
  /// At this time the previous executed operation is considered optimistically final and successful,
  /// meaning no bounce was received and we can continue executing.
  validAfter: bigint // uint32
  /// The timeout required to finalize the currently executing op
  opFinalizationTimeout: bigint // uint32
  /// The address that the (pending) operation was sent to (and could bounce from).
  opPendingReceiver: Address
  /// The truncated body of the pending operation (256 bits from the original message),
  /// stored as the next expected potential bounce, and verified in onBounceMessage handler.
  opPendingBodyTruncated: bigint // uint256
}

/// Each root also authenticates metadata about itself (stored as one of the leaves)
/// which must be revealed when the root is set.
///
/// @dev We need to be careful that abi.encode(MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA, RootMetadata)
/// is greater than 64 bytes to prevent collisions with internal nodes in the Merkle tree. See
/// openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol:15 for details.
export type RootMetadata = {
  // chainId and multiSig uniquely identify a ManyChainMultiSig contract instance that the
  // root is destined for.
  // int256 since it is unclear if we can represent chainId as uint64 (and TON introduces negative chain IDs).
  // There is a proposal (https://ethereum-magicians.org/t/eip-2294-explicit-bound-to-chain-id/11090) to
  // bound chainid to 64 bits, but it is still unresolved.
  chainId: bigint
  multiSig: Address
  // opCount before adding this root (uint40).
  preOpCount: bigint
  // opCount after executing all ops in this root (uint40).
  postOpCount: bigint
  // override whatever root was already stored in this contract even if some of its
  // ops weren't executed.
  // Important: it is strongly recommended that offchain code set this to false by default.
  // Be careful setting this to true as it may break assumptions about what transactions from
  // the previous root have already been executed.
  overridePreviousRoot: boolean
}

/// @dev An ECDSA signature.
export type Signature = {
  // Notice: no `v: uint8;` field, as public key recovery is not supported.

  r: bigint // uint256
  s: bigint // uint256

  // Instead of v attach the signer (public key hash)
  signer: bigint // uint256
}

/// An op to be executed by the ManyChainMultiSig contract
///
/// @dev We need to be careful that abi.encode(LEAF_OP_DOMAIN_SEPARATOR, RootMetadata)
/// is greater than 64 bytes to prevent collisions with internal nodes in the Merkle tree. See
/// openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol:15 for details.
export type Op = {
  // The chain ID for which this operation is intended (int256 as TON introduces negative chain IDs).
  chainId: bigint
  // The address of the multiSig contract
  multiSig: Address
  // The nonce for this operation (uint40)
  nonce: bigint
  // The recipient address
  to: Address
  // The value to be sent (in coins)
  value: bigint
  // The body of the operation
  data: Cell
}

export const opcodes = {
  in: {
    TopUp: crc32('MCMS_TopUp'),
    SetRoot: crc32('MCMS_SetRoot'),
    Execute: crc32('MCMS_Execute'),
    SetConfig: crc32('MCMS_SetConfig'),
    SubmitErrorReport: crc32('MCMS_SubmitErrorReport'),
    TransferOracleRole: crc32('MCMS_TransferOracleRole'),
  },
  out: {
    NewRoot: crc32('MCMS_NewRoot'),
    ConfigSet: crc32('MCMS_ConfigSet'),
    OpExecuted: crc32('MCMS_OpExecuted'),
    ErrorReportedSubmitted: crc32('MCMS_ErrorReportSubmitted'),
    OracleRoleTransferred: crc32('MCMS_OracleRoleTransferred'),
  },
}

const rootMetadata: CellCodec<RootMetadata> = {
  encode: (data: RootMetadata): Builder => {
    return beginCell()
      .storeInt(data.chainId, 256)
      .storeAddress(data.multiSig)
      .storeUint(data.preOpCount, 40)
      .storeUint(data.postOpCount, 40)
      .storeBit(data.overridePreviousRoot)
  },
  load: (src: Slice): RootMetadata => {
    return {
      chainId: src.loadIntBig(256),
      multiSig: src.loadAddress(),
      preOpCount: src.loadUintBig(40),
      postOpCount: src.loadUintBig(40),
      overridePreviousRoot: src.loadBoolean(),
    }
  },
}

export const builder = {
  message: {
    in: {
      // Creates a new `MCMS_TopUp` message.
      topUp: {
        encode: (msg: TopUp): Builder => {
          return beginCell() // break line
            .storeUint(opcodes.in.TopUp, 32)
            .storeUint(msg.queryId, 64)
        },
        load: (src: Slice): TopUp => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
          }
        },
      },
      // Creates a new `MCMS_SetRoot` message.
      setRoot: {
        encode: (msg: SetRoot): Builder => {
          return beginCell()
            .storeUint(opcodes.in.SetRoot, 32)
            .storeUint(msg.queryId, 64)
            .storeUint(msg.root, 256)
            .storeUint(msg.validUntil, 32)
            .storeBuilder(rootMetadata.encode(msg.metadata))
            .storeRef(msg.metadataProof)
            .storeRef(msg.signatures)
            .storeUint(msg.opFinalizationTimeout, 32)
        },
        load: (src: Slice): SetRoot => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            root: src.loadUintBig(256),
            validUntil: src.loadUintBig(32),
            metadata: src.loadRef().beginParse() as unknown as RootMetadata, // TODO: decode metadata properly
            metadataProof: src.loadRef(),
            signatures: src.loadRef(),
            opFinalizationTimeout: src.loadUintBig(32),
          }
        },
      },
      // Creates a new `MCMS_Execute` message.
      execute: {
        encode: (msg: Execute): Builder => {
          return beginCell()
            .storeUint(opcodes.in.Execute, 32)
            .storeUint(msg.queryId, 64)
            .storeRef(msg.op)
            .storeRef(asSnakeData<bigint>(msg.proof, (v) => beginCell().storeUint(v, 256)))
        },
        load: (src: Slice): Execute => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            op: src.loadRef(),
            proof: fromSnakeData(src.loadRef(), (a) => a.loadUintBig(256)),
          }
        },
      },
      // Creates a new `MCMS_SetConfig` message.
      setConfig: {
        encode: (msg: SetConfig): Builder => {
          return beginCell()
            .storeUint(opcodes.in.SetConfig, 32)
            .storeUint(msg.queryId, 64)
            .storeRef(asSnakeData<bigint>(msg.signerKeys, (a) => beginCell().storeUint(a, 256)))
            .storeRef(asSnakeData<number>(msg.signerGroups, (g) => beginCell().storeUint(g, 8)))
            .storeDict(
              loadMap(Dictionary.Keys.Uint(8), Dictionary.Values.Uint(8), msg.groupQuorums),
            )
            .storeDict(
              loadMap(Dictionary.Keys.Uint(8), Dictionary.Values.Uint(8), msg.groupParents),
            )
            .storeBit(msg.clearRoot)
        },
        load: (src: Slice): SetConfig => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            signerKeys: fromSnakeData<bigint>(src.loadRef(), (a) => a.loadUintBig(256)),
            signerGroups: fromSnakeData<number>(src.loadRef(), (g) => g.loadUint(8)),
            groupQuorums: loadDict(
              Dictionary.loadDirect(
                Dictionary.Keys.Uint(8),
                Dictionary.Values.Uint(8),
                src.loadRef(),
              ),
            ),
            groupParents: loadDict(
              Dictionary.loadDirect(
                Dictionary.Keys.Uint(8),
                Dictionary.Values.Uint(8),
                src.loadRef(),
              ),
            ),
            clearRoot: src.loadBoolean(),
          }
        },
      },
      submitErrorReport: {
        encode: (msg: SubmitErrorReport): Builder => {
          return beginCell()
            .storeUint(opcodes.in.SubmitErrorReport, 32)
            .storeUint(msg.queryId, 64)
            .storeRef(msg.op)
            .storeRef(asSnakeData<bigint>(msg.proof, (v) => beginCell().storeUint(v, 256)))
            .storeUint(msg.opTxHash, 256)
            .storeUint(msg.errorTxHash, 256)
            .storeUint(msg.errorCode, 32)
        },
        load: (src: Slice): SubmitErrorReport => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            op: src.loadRef(),
            proof: fromSnakeData(src.loadRef(), (a) => a.loadUintBig(256)),
            opTxHash: src.loadUintBig(256),
            errorTxHash: src.loadUintBig(256),
            errorCode: src.loadUint(32),
          }
        },
      },
      transferOracleRole: {
        encode: (msg: TransferOracleRole): Builder => {
          return beginCell()
            .storeUint(opcodes.in.TransferOracleRole, 32)
            .storeUint(msg.queryId, 64)
            .storeAddress(msg.newOracle)
        },
        load: (src: Slice): TransferOracleRole => {
          src.skip(32) // skip opcode
          return {
            queryId: src.loadUintBig(64),
            newOracle: src.loadAddress(),
          }
        },
      },
    },
  },
  data: (() => {
    const config: CellCodec<Config> = {
      encode: (data: Config): Builder => {
        const signers = loadMap(
          Dictionary.Keys.Uint(8),
          Dictionary.Values.Buffer(LEN_SIGNER_BYTES),
          data.signers,
        )
        const groupQuorums = loadMap(
          Dictionary.Keys.Uint(8),
          Dictionary.Values.Uint(8),
          data.groupQuorums,
        )
        const groupParents = loadMap(
          Dictionary.Keys.Uint(8),
          Dictionary.Values.Uint(8),
          data.groupParents,
        )
        return beginCell()
          .storeDict(signers, Dictionary.Keys.Uint(8), Dictionary.Values.Buffer(LEN_SIGNER_BYTES))
          .storeDict(groupQuorums, Dictionary.Keys.Uint(8), Dictionary.Values.Uint(8))
          .storeDict(groupParents, Dictionary.Keys.Uint(8), Dictionary.Values.Uint(8))
      },
      load: (src: Slice): Config => {
        return {
          signers: loadDict(
            Dictionary.loadDirect(
              Dictionary.Keys.Uint(8),
              Dictionary.Values.Buffer(LEN_SIGNER_BYTES),
              src.loadRef(),
            ),
          ),
          groupQuorums: loadDict(
            Dictionary.loadDirect(
              Dictionary.Keys.Uint(8),
              Dictionary.Values.Uint(8),
              src.loadRef(),
            ),
          ),
          groupParents: loadDict(
            Dictionary.loadDirect(
              Dictionary.Keys.Uint(8),
              Dictionary.Values.Uint(8),
              src.loadRef(),
            ),
          ),
        }
      },
    }

    const opPendingInfo: CellCodec<OpPendingInfo> = {
      encode: (data: OpPendingInfo): Builder => {
        return beginCell()
          .storeUint(data.validAfter, 32)
          .storeUint(data.opFinalizationTimeout, 32)
          .storeAddress(data.opPendingReceiver)
          .storeUint(data.opPendingBodyTruncated, 256)
      },
      load: (src: Slice): OpPendingInfo => {
        return {
          validAfter: src.loadUintBig(32),
          opFinalizationTimeout: src.loadUintBig(32),
          opPendingReceiver: src.loadAddress(),
          opPendingBodyTruncated: src.loadUintBig(256),
        }
      },
    }

    const expiringRootAndOpCount: CellCodec<ExpiringRootAndOpCount> = {
      encode: (data: ExpiringRootAndOpCount): Builder => {
        return beginCell()
          .storeUint(data.root, 256)
          .storeUint(data.validUntil, 32)
          .storeUint(data.opCount, 40)
          .storeRef(opPendingInfo.encode(data.opPendingInfo))
      },
      load: (src: Slice): ExpiringRootAndOpCount => {
        return {
          root: src.loadUintBig(256),
          validUntil: src.loadUintBig(32),
          opCount: src.loadUintBig(40),
          opPendingInfo: opPendingInfo.load(src.loadRef().beginParse()),
        }
      },
    }

    /// Information about the current root, extracted into a separate struct (wrapped in a cell).
    const rootInfo: CellCodec<RootInfo> = {
      encode: (data: RootInfo): Builder => {
        return beginCell()
          .storeBuilder(expiringRootAndOpCount.encode(data.expiringRootAndOpCount))
          .storeBuilder(rootMetadata.encode(data.rootMetadata))
      },
      load: (src: Slice): RootInfo => {
        return {
          expiringRootAndOpCount: expiringRootAndOpCount.load(src),
          rootMetadata: rootMetadata.load(src),
        }
      },
    }

    // Creates a new `Signer` data cell
    const signer: CellCodec<Signer> = {
      encode: (signer: Signer): Builder => {
        return beginCell()
          .storeUint(signer.key, 256)
          .storeUint(signer.index, 8)
          .storeUint(signer.group, 8)
      },
      load: (src: Slice): Signer => {
        return {
          key: src.loadUintBig(256),
          index: src.loadUint(8),
          group: src.loadUint(8),
        }
      },
    }

    // Creates a new `MCMS_Op` data cell
    const op: CellCodec<Op> = {
      encode: (op: Op): Builder => {
        return beginCell()
          .storeInt(op.chainId, 256)
          .storeAddress(op.multiSig)
          .storeUint(op.nonce, 40)
          .storeAddress(op.to)
          .storeCoins(op.value)
          .storeRef(op.data)
      },
      load: (src: Slice): Op => {
        return {
          chainId: src.loadIntBig(256),
          multiSig: src.loadAddress(),
          nonce: src.loadUintBig(40),
          to: src.loadAddress(),
          value: src.loadCoins(),
          data: src.loadRef(),
        }
      },
    }
    const signature: CellCodec<Signature> = {
      encode: (data: Signature): Builder => {
        return beginCell().storeUint(data.r, 256).storeUint(data.s, 256).storeUint(data.signer, 256)
      },
      load: (src: Slice): Signature => {
        return {
          r: src.loadUintBig(256),
          s: src.loadUintBig(256),
          signer: src.loadUintBig(256),
        }
      },
    }

    // Creates a new `MCMS_Data` contract data cell
    const contractData: CellCodec<ContractData> = {
      encode: (data: ContractData): Builder => {
        let _pendingOwnerMaybe = data.ownable.pendingOwner
          ? beginCell().storeAddress(data.ownable.pendingOwner)
          : null

        return beginCell()
          .storeUint(data.id, 32)
          .storeBuilder(
            beginCell().storeAddress(data.ownable.owner).storeMaybeBuilder(_pendingOwnerMaybe),
          )
          .storeAddress(data.oracle)
          .storeDict(
            loadMap(
              Dictionary.Keys.BigUint(256),
              Dictionary.Values.Buffer(LEN_SIGNER_BYTES),
              data.signers,
            ),
            Dictionary.Keys.BigUint(256),
            Dictionary.Values.Buffer(LEN_SIGNER_BYTES),
          )
          .storeRef(config.encode(data.config))
          .storeDict(
            loadMap(Dictionary.Keys.BigUint(256), Dictionary.Values.Bool(), data.seenSignedHashes),
            Dictionary.Keys.BigUint(256),
            Dictionary.Values.Bool(),
          )
          .storeRef(rootInfo.encode(data.rootInfo))
      },
      load: (src: Slice): ContractData => {
        return {
          id: src.loadUint(32),
          ownable: {
            owner: src.loadAddress(),
            pendingOwner: src.loadAddress(),
          },
          oracle: src.loadAddress(),
          signers: loadDict(
            Dictionary.loadDirect(
              Dictionary.Keys.BigUint(256),
              Dictionary.Values.Buffer(LEN_SIGNER_BYTES),
              src.loadRef(),
            ),
          ),
          config: config.load(src.loadRef().beginParse()),
          seenSignedHashes: loadDict(
            Dictionary.loadDirect(
              Dictionary.Keys.BigUint(256),
              Dictionary.Values.Bool(),
              src.loadRef(),
            ),
          ),
          rootInfo: rootInfo.load(src.loadRef().beginParse()),
        }
      },
    }

    const contractDataEmpty = (id: number, owner: Address): ContractData => {
      return {
        id, // unique ID for this instance
        ownable: {
          owner,
          pendingOwner: null, // no pending owner
        },
        oracle: ZERO_ADDRESS,
        signers: new Map<bigint, Buffer>(),
        config: {
          signers: new Map<number, Buffer>(),
          groupQuorums: new Map<number, number>(),
          groupParents: new Map<number, number>(),
        },
        seenSignedHashes: new Map<bigint, boolean>(),
        rootInfo: {
          expiringRootAndOpCount: {
            root: 0n, // no root
            validUntil: 0n, // no validity
            opCount: 0n, // no ops
            opPendingInfo: {
              validAfter: 0n, // no valid after
              opFinalizationTimeout: 0n, // no op finalization timeout
              opPendingReceiver: ZERO_ADDRESS, // no op pending receiver
              opPendingBodyTruncated: 0n, // no op pending body
            },
          },
          rootMetadata: {
            chainId: 0n, // no chain ID
            multiSig: ZERO_ADDRESS, // no multiSig
            preOpCount: 0n, // no pre-op count
            postOpCount: 0n, // no post-op count
            overridePreviousRoot: false, // no override
          },
        },
      }
    }

    return {
      config,
      rootMetadata,
      opPendingInfo,
      expiringRootAndOpCount,
      op,
      signature,
      contractData,
      contractDataEmpty,
      signer,
    }
  })(),
}

export class ContractClient implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static newAt(address: Address): ContractClient {
    return new ContractClient(address)
  }

  static newFrom(data: ContractData, code: Cell, workchain = 0) {
    const init = { code, data: builder.data.contractData.encode(data).endCell() }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, { value, sendMode: SendMode.PAY_GAS_SEPARATELY, body })
  }

  async sendTopUp(p: ContractProvider, via: Sender, value: bigint = 0n, body: TopUp) {
    return this.sendInternal(p, via, value, builder.message.in.topUp.encode(body).endCell())
  }

  async sendSetRoot(p: ContractProvider, via: Sender, value: bigint = 0n, body: SetRoot) {
    return this.sendInternal(p, via, value, builder.message.in.setRoot.encode(body).endCell())
  }

  async sendExecute(p: ContractProvider, via: Sender, value: bigint = 0n, body: Execute) {
    return this.sendInternal(p, via, value, builder.message.in.execute.encode(body).endCell())
  }

  async sendSetConfig(p: ContractProvider, via: Sender, value: bigint = 0n, body: SetConfig) {
    return this.sendInternal(p, via, value, builder.message.in.setConfig.encode(body).endCell())
  }

  // --- Getters ---

  async getTypeAndVersion(p: ContractProvider): Promise<[string, string]> {
    const r = await p.get('typeAndVersion', [])
    const type = r.stack.readString()
    const version = r.stack.readString()
    return [type, version]
  }

  async getConfig(p: ContractProvider): Promise<Config> {
    return p.get('getConfig', []).then((r) => ({
      signers: loadDict(
        Dictionary.loadDirect(
          Dictionary.Keys.Uint(8),
          Dictionary.Values.Buffer(LEN_SIGNER_BYTES),
          r.stack.readCell(),
        ),
      ),
      groupQuorums: loadDict(
        Dictionary.loadDirect(
          Dictionary.Keys.Uint(8),
          Dictionary.Values.Uint(8),
          r.stack.readCell(),
        ),
      ),
      groupParents: loadDict(
        Dictionary.loadDirect(
          Dictionary.Keys.Uint(8),
          Dictionary.Values.Uint(8),
          r.stack.readCell(),
        ),
      ),
    }))
  }

  async getOpCount(p: ContractProvider): Promise<bigint> {
    return p.get('getOpCount', []).then((r) => r.stack.readBigNumber())
  }

  async getRoot(p: ContractProvider): Promise<[bigint, bigint]> {
    return p.get('getRoot', []).then((r) => [r.stack.readBigNumber(), r.stack.readBigNumber()])
  }

  async getOpPendingInfo(p: ContractProvider): Promise<OpPendingInfo> {
    return p.get('getOpPendingInfo', []).then((r) => {
      return {
        validAfter: r.stack.readBigNumber(),
        opFinalizationTimeout: r.stack.readBigNumber(),
        opPendingReceiver: r.stack.readAddressOpt() || ZERO_ADDRESS,
        opPendingBodyTruncated: r.stack.readBigNumber(),
      }
    })
  }

  async getRootMetadata(p: ContractProvider): Promise<RootMetadata> {
    return p.get('getRootMetadata', []).then((r) => {
      return {
        chainId: r.stack.readBigNumber(),
        multiSig: r.stack.readAddress(),
        preOpCount: r.stack.readBigNumber(),
        postOpCount: r.stack.readBigNumber(),
        overridePreviousRoot: r.stack.readBoolean(),
      }
    })
  }

  async getOracle(p: ContractProvider): Promise<Address> {
    return p.get('getOracle', []).then((r) => r.stack.readAddress())
  }
}
