import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Dictionary,
  Sender,
  SendMode,
} from '@ton/core'
import { crc32 } from 'zlib'
import { CellCodec, sha256_32 } from '../utils'
import { ZERO_ADDRESS } from '../../utils'
import * as ownable2step from '../libraries/access/Ownable2Step'

// @dev Top up contract with TON coins.
export type TopUp = {
  // Query ID of the change owner request.
  queryId: bigint
}

// @dev Sets a new expiring root.
export type SetRoot = {
  // Query ID of the change owner request.
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
}

// @dev Executes an operation authenticated by the Merkle tree.
export type Execute = {
  // Query ID of the execute request.
  queryId: bigint

  // The operation to be executed, stored as a Cell to avoid size limits.
  op: Cell // Cell<Op>
  // The Merkle proof for the op's inclusion in the Merkle tree.
  proof: Cell // vec<uint256>
}

// @dev Sets the configuration for the contract.
export type SetConfig = {
  // Query ID of the change owner request.
  queryId: bigint

  // List of signer public keys.
  signerKeys: Cell // vec<uint256>
  // List of signer groups.
  signerGroups: Cell // vec<uint8>
  // List of group quorums.
  groupQuorums: Dictionary<number, number> // map<uint8, uint8> (indexed, iterable backwards)
  // List of group parents.
  groupParents: Dictionary<number, number> // map<uint8, uint8> (indexed, iterable backwards)
  // Whether to clear the current root.
  clearRoot: boolean
}

// @dev Union of all (input) messages.
export type InMessage = TopUp | SetRoot | Execute | SetConfig

// MCMS contract storage
export type ContractData = {
  /// ID allows multiple independent instances, since contract address depends on initial state.
  id: number // uint32

  /// Ownable trait data
  ownable: ownable2step.Data
  /// Map where entry exists if the public key is a signer
  signers: Dictionary<bigint, Buffer> // map<uint256, Signer>
  /// The current configuration of the contract
  config: Config

  /// Remember signedHashes that this contract has seen. Each signedHash can only be set once.
  seenSignedHashes: Dictionary<bigint, boolean> // map<uint256, bool>
  /// The current expiring root and the number of ops in it.
  expiringRootAndOpCount: ExpiringRootAndOpCount
  /// The current metadata about the root.
  rootMetadata: RootMetadata
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
  /// @notice Thrown when number of signers is 0 or greater than MAX_NUM_SIGNERS.
  OUT_OF_BOUNDS_NUM_SIGNERS = 100,

  /// @notice Thrown when signerKeys and signerGroups have different lengths.
  SIGNER_GROUPS_LENGTH_MISMATCH = 101,

  /// @notice Thrown when number of some signer's group is greater than (NUM_GROUPS-1).
  OUT_OF_BOUNDS_GROUP = 102,

  /// @notice Thrown when the group tree isn't well-formed.
  GROUP_TREE_NOT_WELL_FORMED = 103,

  /// @notice Thrown when the quorum of some group is larger than the number of signers in it.
  OUT_OF_BOUNDS_GROUP_QUORUM = 104,

  /// @notice Thrown when a disabled group contains a signer.
  SIGNER_IN_DISABLED_GROUP = 105,

  /// @notice Thrown when the signers' public keys are not a strictly increasing monotone sequence.
  /// Prevents signers from including more than one signature.
  SIGNERS_KEYS_MUST_BE_STRICTLY_INCREASING = 106,

  /// @notice Thrown when the signature corresponds to invalid signer.
  INVALID_SIGNER = 107,

  /// @notice Thrown when there is no sufficient set of valid signatures provided to make the
  /// root group successful.
  INSUFFICIENT_SIGNERS = 108,

  /// @notice Thrown when attempt to set metadata or execute op for another chain.
  WRONG_CHAIN_ID = 109,

  /// @notice Thrown when the multiSig address in metadata or op is
  /// incompatible with the address of this contract.
  WRONG_MULTI_SIG = 110,

  /// @notice Thrown when the preOpCount <= postOpCount invariant is violated.
  WRONG_POST_OP_COUNT = 111,

  /// @notice Thrown when attempting to set a new root while there are still pending ops
  /// from the previous root without explicitly overriding it.
  PENDING_OPS = 112,

  /// @notice Thrown when preOpCount in metadata is incompatible with the current opCount.
  WRONG_PRE_OP_COUNT = 113,

  /// @notice Thrown when the provided merkle proof cannot be verified.
  PROOF_CANNOT_BE_VERIFIED = 114,

  /// @notice Thrown when attempt to execute an op after
  /// s_expiringRootAndOpCount.validUntil has passed.
  ROOT_EXPIRED = 115,

  /// @notice Thrown when attempt to bypass the enforced ops' order in the merkle tree or
  /// re-execute an op.
  WRONG_NONCE = 116,

  /// @notice Thrown when attempting to execute an op even though opCount equals
  /// metadata.postOpCount.
  POST_OP_COUNT_REACHED = 117,

  /// @notice Thrown when the underlying call in _execute() reverts.
  CALL_REVERTED = 118,

  /// @notice Thrown when attempt to set past validUntil for the root.
  VALID_UNTIL_HAS_ALREADY_PASSED = 119,

  /// @notice Thrown when setRoot() is called before setting a config.
  MISSING_CONFIG = 120,

  /// @notice Thrown when attempt to set the same (root, validUntil) in setRoot().
  SIGNED_HASH_ALREADY_SEEN = 121,
}

// --- Data structures ---

// Length of serialized signer structure in bytes.
export const LEN_SIGNER = 267 + 8 + 8

// Signer information
export type Signer = {
  // The address of the signer.
  address: Address
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
  signers: Dictionary<number, Buffer> // map<uint8, Signer> - (indexed)
  // groupQuorums[i] stores the quorum for the i-th signer group. Any group with
  // groupQuorums[i] = 0 is considered disabled. The i-th group is successful if
  // it is enabled and at least groupQuorums[i] of its children are successful.
  groupQuorums: Dictionary<number, number> // map<uint8, uint8> (indexed, iterable backwards)
  // groupParents[i] stores the parent group of the i-th signer group. We ensure that the
  // groups form a tree structure (where the root/0-th signer group points to itself as
  // parent) by enforcing:
  // - (i != 0) implies (groupParents[i] < i)
  // - groupParents[0] == 0
  groupParents: Dictionary<number, number> // map<uint8, uint8> (indexed, iterable backwards)
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
}

/// @notice Each root also authenticates metadata about itself (stored as one of the leaves)
/// which must be revealed when the root is set.
///
/// @dev We need to be careful that abi.encode(MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA, RootMetadata)
/// is greater than 64 bytes to prevent collisions with internal nodes in the Merkle tree. See
/// openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol:15 for details.
export type RootMetadata = {
  // chainId and multiSig uniquely identify a ManyChainMultiSig contract instance that the
  // root is destined for.
  // uint256 since it is unclear if we can represent chainId as uint64. There is a proposal (
  // https://ethereum-magicians.org/t/eip-2294-explicit-bound-to-chain-id/11090) to
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

  r: bigint // bytes32
  s: bigint // bytes32

  // Instead of v attach the signer (public key hash)
  signer: Address
}

/// @notice an op to be executed by the ManyChainMultiSig contract
///
/// @dev We need to be careful that abi.encode(LEAF_OP_DOMAIN_SEPARATOR, RootMetadata)
/// is greater than 64 bytes to prevent collisions with internal nodes in the Merkle tree. See
/// openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol:15 for details.
export type Op = {
  // The chain ID for which this operation is intended (uint256)
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
  },
  out: {
    NewRoot: crc32('MCMS_NewRoot'),
    ConfigSet: crc32('MCMS_ConfigSet'),
    OpExecuted: crc32('MCMS_OpExecuted'),
  },
}

export const builder = {
  message: {
    in: {
      // Creates a new `MCMS_TopUp` message.
      topUp: {
        encode: (msg: TopUp): Cell => {
          return beginCell() // break line
            .storeUint(opcodes.in.TopUp, 32)
            .storeUint(msg.queryId, 64)
            .endCell()
        },
        decode: (cell: Cell): TopUp => {
          const s = cell.beginParse()
          s.skip(32) // skip opcode
          return {
            queryId: s.loadUintBig(64),
          }
        },
      },
      // Creates a new `MCMS_SetRoot` message.
      setRoot: {
        encode: (msg: SetRoot): Cell => {
          return (
            beginCell()
              .storeUint(opcodes.in.SetRoot, 32)
              .storeUint(msg.queryId, 64)
              .storeUint(msg.root, 256)
              .storeUint(msg.validUntil, 32)
              // .storeSlice(msg.metadata) // TODO: encode metadata properly
              .storeRef(msg.metadataProof)
              .storeRef(msg.signatures)
              .endCell()
          )
        },
        decode: (cell: Cell): SetRoot => {
          const s = cell.beginParse()
          s.skip(32) // skip opcode
          return {
            queryId: s.loadUintBig(64),
            root: s.loadUintBig(256),
            validUntil: s.loadUintBig(32),
            metadata: s.loadRef().beginParse() as unknown as RootMetadata, // TODO: decode metadata properly
            metadataProof: s.loadRef(),
            signatures: s.loadRef(),
          }
        },
      },
      // Creates a new `MCMS_Execute` message.
      execute: {
        encode: (msg: Execute): Cell => {
          return beginCell()
            .storeUint(opcodes.in.Execute, 32)
            .storeUint(msg.queryId, 64)
            .storeRef(msg.op)
            .storeRef(msg.proof)
            .endCell()
        },
        decode: (cell: Cell): Execute => {
          const s = cell.beginParse()
          s.skip(32) // skip opcode
          return {
            queryId: s.loadUintBig(64),
            op: s.loadRef(),
            proof: s.loadRef(),
          }
        },
      },
      // Creates a new `MCMS_SetConfig` message.
      setConfig: {
        encode: (msg: SetConfig): Cell => {
          return beginCell()
            .storeUint(opcodes.in.SetConfig, 32)
            .storeUint(msg.queryId, 64)
            .storeRef(msg.signerKeys)
            .storeRef(msg.signerGroups)
            .storeDict(msg.groupQuorums)
            .storeDict(msg.groupParents)
            .storeBit(msg.clearRoot)
            .endCell()
        },
        decode: (cell: Cell): SetConfig => {
          const s = cell.beginParse()
          s.skip(32) // skip opcode
          return {
            queryId: s.loadUintBig(64),
            signerKeys: s.loadRef(),
            signerGroups: s.loadRef(),
            groupQuorums: Dictionary.load(
              Dictionary.Keys.Uint(8),
              Dictionary.Values.Uint(8),
              s.loadRef(),
            ),
            groupParents: Dictionary.load(
              Dictionary.Keys.Uint(8),
              Dictionary.Values.Uint(8),
              s.loadRef(),
            ),
            clearRoot: s.loadBoolean(), // boolean
          }
        },
      },
    },
  },
  data: (() => {
    const config: CellCodec<Config> = {
      encode: (data: Config): Cell => {
        return beginCell()
          .storeDict(data.signers, Dictionary.Keys.Uint(8), Dictionary.Values.Buffer(LEN_SIGNER))
          .storeDict(data.groupQuorums, Dictionary.Keys.Uint(8), Dictionary.Values.Uint(8))
          .storeDict(data.groupParents, Dictionary.Keys.Uint(8), Dictionary.Values.Uint(8))
          .endCell()
      },
      decode: (cell: Cell): Config => {
        const s = cell.beginParse()
        return {
          signers: Dictionary.load(
            Dictionary.Keys.Uint(8),
            Dictionary.Values.Buffer(LEN_SIGNER),
            s.loadRef(),
          ),
          groupQuorums: Dictionary.load(
            Dictionary.Keys.Uint(8),
            Dictionary.Values.Uint(8),
            s.loadRef(),
          ),
          groupParents: Dictionary.load(
            Dictionary.Keys.Uint(8),
            Dictionary.Values.Uint(8),
            s.loadRef(),
          ),
        }
      },
    }

    const rootMetadata: CellCodec<RootMetadata> = {
      encode: (data: RootMetadata): Cell => {
        return beginCell()
          .storeUint(data.chainId, 256)
          .storeAddress(data.multiSig)
          .storeUint(data.preOpCount, 40)
          .storeUint(data.postOpCount, 40)
          .storeBit(data.overridePreviousRoot)
          .endCell()
      },
      decode: (cell: Cell): RootMetadata => {
        const s = cell.beginParse()
        return {
          chainId: s.loadUintBig(256),
          multiSig: s.loadAddress(),
          preOpCount: s.loadUintBig(40),
          postOpCount: s.loadUintBig(40),
          overridePreviousRoot: s.loadBoolean(),
        }
      },
    }

    const expiringRootAndOpCount: CellCodec<ExpiringRootAndOpCount> = {
      encode: (data: ExpiringRootAndOpCount): Cell => {
        return beginCell()
          .storeUint(data.root, 256)
          .storeUint(data.validUntil, 32)
          .storeUint(data.opCount, 40)
          .endCell()
      },
      decode: (cell: Cell): ExpiringRootAndOpCount => {
        const s = cell.beginParse()
        return {
          root: s.loadUintBig(256),
          validUntil: s.loadUintBig(32),
          opCount: s.loadUintBig(40),
        }
      },
    }

    // Creates a new `MCMS_Op` data cell
    const op: CellCodec<Op> = {
      encode: (op: Op): Cell => {
        return beginCell()
          .storeUint(op.chainId, 256)
          .storeAddress(op.multiSig)
          .storeUint(op.nonce, 40)
          .storeAddress(op.to)
          .storeCoins(op.value)
          .storeRef(op.data)
          .endCell()
      },
      decode: (cell: Cell): Op => {
        const s = cell.beginParse()
        return {
          chainId: s.loadUintBig(256),
          multiSig: s.loadAddress(),
          nonce: s.loadUintBig(40),
          to: s.loadAddress(),
          value: s.loadCoins(),
          data: s.loadRef(),
        }
      },
    }
    const signature: CellCodec<Signature> = {
      encode: (data: Signature): Cell => {
        return beginCell()
          .storeUint(data.r, 256)
          .storeUint(data.s, 256)
          .storeAddress(data.signer)
          .endCell()
      },
      decode: (cell: Cell): Signature => {
        const s = cell.beginParse()
        return {
          r: s.loadUintBig(256),
          s: s.loadUintBig(256),
          signer: s.loadAddress(),
        }
      },
    }

    // Creates a new `MCMS_Data` contract data cell
    const contractData: CellCodec<ContractData> = {
      encode: (data: ContractData): Cell => {
        let _pendingOwnerMaybe = data.ownable.pendingOwner
          ? beginCell().storeAddress(data.ownable.pendingOwner)
          : null
        let ownable = beginCell()
          .storeAddress(data.ownable.owner)
          .storeMaybeBuilder(_pendingOwnerMaybe)

        return beginCell()
          .storeUint(data.id, 32)
          .storeBuilder(ownable)
          .storeDict(
            data.signers,
            Dictionary.Keys.BigUint(256),
            Dictionary.Values.Buffer(LEN_SIGNER),
          )
          .storeRef(config.encode(data.config))
          .storeDict(data.seenSignedHashes, Dictionary.Keys.BigUint(256), Dictionary.Values.Bool())
          .storeBuilder(expiringRootAndOpCount.encode(data.expiringRootAndOpCount).asBuilder())
          .storeRef(rootMetadata.encode(data.rootMetadata))
          .endCell()
      },
      decode: (cell: Cell): ContractData => {
        const s = cell.beginParse()

        const id = s.loadUint(32)
        const ownable = {
          owner: s.loadAddress(),
          pendingOwner: s.loadAddress(),
        }

        const signers = Dictionary.load(
          Dictionary.Keys.BigUint(256),
          Dictionary.Values.Buffer(LEN_SIGNER),
          s.loadRef(),
        )

        const _config = config.decode(s.loadRef())

        const seenSignedHashes = Dictionary.load(
          Dictionary.Keys.BigUint(256),
          Dictionary.Values.Bool(),
          s.loadRef(),
        )

        const expiringRootAndOpCount = {
          root: s.loadUintBig(256),
          opCount: s.loadUintBig(40),
          validUntil: s.loadUintBig(32),
        }

        const rootMetadata = {
          chainId: s.loadUintBig(256),
          multiSig: s.loadAddress(),
          preOpCount: s.loadUintBig(40),
          postOpCount: s.loadUintBig(40),
          overridePreviousRoot: s.loadBoolean(),
        }

        return {
          id,
          ownable,
          signers,
          config: _config,
          seenSignedHashes,
          expiringRootAndOpCount,
          rootMetadata,
        }
      },
    }

    const contractDataEmpty = (id: number, owner: Address) => {
      return {
        id, // unique ID for this instance
        ownable: {
          owner,
          pendingOwner: null, // no pending owner
        },
        signers: Dictionary.empty(
          // no signers
          Dictionary.Keys.BigUint(256),
          Dictionary.Values.Buffer(LEN_SIGNER),
        ),
        config: {
          signers: Dictionary.empty(
            // no signers
            Dictionary.Keys.Uint(8),
            Dictionary.Values.Buffer(LEN_SIGNER),
          ),
          groupQuorums: Dictionary.empty(
            // no group quorums
            Dictionary.Keys.Uint(8),
            Dictionary.Values.Uint(8),
          ),
          groupParents: Dictionary.empty(
            // no group parents
            Dictionary.Keys.Uint(8),
            Dictionary.Values.Uint(8),
          ),
        },
        seenSignedHashes: Dictionary.empty(
          // no seen signed hashes
          Dictionary.Keys.BigUint(256),
          Dictionary.Values.Bool(),
        ),
        expiringRootAndOpCount: {
          root: 0n, // no root
          validUntil: 0n, // no validity
          opCount: 0n, // no ops
        },
        rootMetadata: {
          chainId: 0n, // no chain ID
          multiSig: ZERO_ADDRESS, // no multiSig
          preOpCount: 0n, // no pre-op count
          postOpCount: 0n, // no post-op count
          overridePreviousRoot: false, // no override
        },
      }
    }

    return {
      config,
      rootMetadata,
      expiringRootAndOpCount,
      op,
      signature,
      contractData,
      contractDataEmpty,
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
    const init = { code, data: builder.data.contractData.encode(data) }
    return new ContractClient(contractAddress(workchain, init), init)
  }

  async sendInternal(p: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await p.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
    })
  }

  async sendTopUp(p: ContractProvider, via: Sender, value: bigint = 0n, body: TopUp) {
    return this.sendInternal(p, via, value, builder.message.in.topUp.encode(body))
  }

  async sendSetRoot(p: ContractProvider, via: Sender, value: bigint = 0n, body: SetRoot) {
    return this.sendInternal(p, via, value, builder.message.in.setRoot.encode(body))
  }

  async sendExecute(p: ContractProvider, via: Sender, value: bigint = 0n, body: Execute) {
    return this.sendInternal(p, via, value, builder.message.in.execute.encode(body))
  }

  async sendSetConfig(p: ContractProvider, via: Sender, value: bigint = 0n, body: SetConfig) {
    return this.sendInternal(p, via, value, builder.message.in.setConfig.encode(body))
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
      signers: Dictionary.load(
        Dictionary.Keys.Uint(8),
        Dictionary.Values.Buffer(LEN_SIGNER),
        r.stack.readCell(),
      ),
      groupQuorums: Dictionary.load(
        Dictionary.Keys.Uint(8),
        Dictionary.Values.Uint(8),
        r.stack.readCell(),
      ),
      groupParents: Dictionary.load(
        Dictionary.Keys.Uint(8),
        Dictionary.Values.Uint(8),
        r.stack.readCell(),
      ),
    }))
  }

  async getOpCount(p: ContractProvider): Promise<bigint> {
    return p.get('getOpCount', []).then((r) => r.stack.readBigNumber())
  }

  async getRoot(p: ContractProvider): Promise<[bigint, bigint]> {
    return p.get('getRoot', []).then((r) => [r.stack.readBigNumber(), r.stack.readBigNumber()])
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
}
