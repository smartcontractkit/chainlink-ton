package mcms

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	// TODO: these shoud be outside pkg/ccip/
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ocr"
)

// --- Messages - incoming ---

// @dev Top up contract with TON coins.
// Contract might receive/hold TON as part of the maintenance process.
type TopUp struct {
	_ tlb.Magic `tlb:"#5f427bb3"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`
}

// @dev Sets a new expiring root.
//
// @param root is the new expiring root.
// @param validUntil is the time by which root is valid
// @param metadata is the authenticated metadata about the root, which is stored as one of
// the leaves.
// @param metadataProof is the MerkleProof of inclusion of the metadata in the Merkle tree.
// @param signatures the ECDSA signatures on (root, validUntil).
//
// @dev the message (root, validUntil) should be signed by a sufficient set of signers.
// This signature authenticates also the metadata.
//
// @dev this method can be executed by anyone who has the root and valid signatures.
// as we validate the correctness of signatures, this imposes no risk.
type SetRoot struct {
	_ tlb.Magic `tlb:"#e7fabde3"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Root       *big.Int `tlb:"## 256"` // The new expiring root.
	ValidUntil uint32   `tlb:"## 32"`  // The time by which the root is valid.

	Metadata      RootMetadata                           `tlb:"."` // The metadata about the root, which is stored as one of the leaves.
	MetadataProof common.SnakeData[Proof]                `tlb:"^"` // The MerkleProof of inclusion of the metadata in the Merkle tree. // vec<uint256>
	Signatures    common.SnakeData[ocr.SignatureEd25519] `tlb:"^"` // The ECDSA signatures on (root, validUntil). // vec<Signature>
}

// @notice Execute the received op after verifying the proof of its inclusion in the
// current Merkle tree. The op should be the next op according to the order
// enforced by the merkle tree whose root is stored in data.expiringRootAndOpCount, i.e., the
// nonce of the op should be equal to data.expiringRootAndOpCount.opCount.
//
// @param op is Op to be executed
// @param proof is the MerkleProof for the op's inclusion in the MerkleTree which its
// root is the data.expiringRootAndOpCount.root.
//
// @dev ANYONE can call this function! That's intentional. Callers can only execute verified,
// ordered ops in the Merkle tree.
//
// @dev the gas limit of the call can be freely determined by the caller of this function.
// We expect callees to revert if they run out of gas.
type Execute struct {
	_ tlb.Magic `tlb:"#9b9ce96a"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Op    Op                      `tlb:"^"` // The op to be executed. // Cell<Op>
	Proof common.SnakeData[Proof] `tlb:"^"` // The MerkleProof for the op's inclusion in the MerkleTree // vec<uint256>
}

// @notice sets a new data.config. If clearRoot is true, then it also invalidates
// data.expiringRootAndOpCount.root.
//
// @param signerKeys holds the public keys of the active signers. The keys must be in
// ascending order.
// @param signerGroups maps each signer to its group
// @param groupQuorums holds the required number of valid signatures in each group.
// A group i is called successful group if at least groupQuorum[i] distinct signers provide a
// valid signature.
// @param groupParents holds each group's parent. The groups must be arranged in a tree s.t.
// group 0 is the root of the tree and the i-th group's parent has index j less than i.
// Iff setRoot is called with a set of signatures that causes the root group to be successful,
// setRoot allows a root to be set.
// @param clearRoot, if set to true, invalidates the current root. This option is needed to
// invalidate the current root, so to prevent further ops from being executed. This
// might be used when the current root was signed under a loser group configuration or when
// some previous signers aren't trusted any more.
type SetConfig struct {
	_ tlb.Magic `tlb:"#89277f4b"` //nolint:revive // (opcode) should stay uninitialized
	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	SignerKeys   common.SnakeData[*big.Int] `tlb:"^"`      // vec<uint256>
	SignerGroups common.SnakeData[uint8]    `tlb:"^"`      // vec<uint8>
	GroupQuorums *cell.Dictionary           `tlb:"dict 8"` // map<uint8, uint8> (indexed, iterable backwards)
	GroupParents *cell.Dictionary           `tlb:"dict 8"` // map<uint8, uint8> (indexed, iterable backwards)
	ClearRoot    bool                       `tlb:"bool"`
}

// --- Messages - outgoing ---

// @notice Emitted when a new root is set.
type NewRoot struct {
	_ tlb.Magic `tlb:"#a6533a3d"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Root       *big.Int     `tlb:"## 256"` // The new expiring root.
	ValidUntil uint32       `tlb:"## 32"`  // The time by which the root is valid.
	Metadata   RootMetadata `tlb:"."`      // The metadata about the root, which is stored as one of the leaves.
}

// @notice Emitted when a new config is set.
type ConfigSet struct {
	_ tlb.Magic `tlb:"#d80be574"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Config        Config `tlb:"."`    // The new config.
	IsRootCleared bool   `tlb:"bool"` // Whether the root was cleared.
}

// @notice Emitted when an op gets successfully executed.
type OpExecuted struct {
	_ tlb.Magic `tlb:"#7cf37cbf"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Nonce uint64           `tlb:"## 40"` // The nonce of the operation.
	To    *address.Address `tlb:"addr"`  // The address to which the operation is directed.
	Data  *cell.Cell       `tlb:"^"`     // The data to be sent with the operation. // body
	Value tlb.Coins        `tlb:"^"`     // The value to be sent with the operation. // coins
}

// -- Data structures ---

type Proof struct {
	Value *big.Int `tlb:"## 256"` // The value of the struct
}

// Signing groups are arranged in a tree. Each group is an interior node and has its own quorum.
// Signers are the leaves of the tree. A signer/leaf node is successful iff it furnishes a valid
// signature. A group/interior node is successful iff a quorum of its children are successful.
// setRoot succeeds only if the root group is successful.
// Here is an example:
//
//		                  ┌──────┐
//		               ┌─►│2-of-3│◄───────┐
//		               │  └──────┘        │
//		               │        ▲         │
//		               │        │         │
//		            ┌──┴───┐ ┌──┴───┐ ┌───┴────┐
//		        ┌──►│1-of-2│ │2-of-2│ │signer A│
//		        │   └──────┘ └──────┘ └────────┘
//		        │       ▲      ▲  ▲
//		        │       │      │  │     ┌──────┐
//		        │       │      │  └─────┤1-of-2│◄─┐
//		        │       │      │        └──────┘  │
//		┌───────┴┐ ┌────┴───┐ ┌┴───────┐ ▲        │
//		│signer B│ │signer C│ │signer D│ │        │
//		└────────┘ └────────┘ └────────┘ │        │
//		                                 │        │
//		                          ┌──────┴─┐ ┌────┴───┐
//		                          │signer E│ │signer F│
//		                          └────────┘ └────────┘
//
//	  - If signers [A, B] sign, they can set a root.
//	  - If signers [B, D, E] sign, they can set a root.
//	  - If signers [B, D, E, F] sign, they can set a root. (Either E's or F's signature was
//	    superfluous.)
//	  - If signers [B, C, D] sign, they cannot set a root, because the 2-of-2 group on the second
//	    level isn't successful and therefore the root group isn't successful either.
//
// To map this tree to a Config, we:
//   - create an entry in signers for each signer (sorted by address in ascending order)
//   - assign the root group to index 0 and have it be its own parent
//   - assign an index to each non-root group, such that each group's parent has a lower index
//     than the group itself
//
// For example, we could transform the above tree structure into:
// groupQuorums = [2, 1, 2, 1] + [0, 0, ...] (rightpad with 0s to NUM_GROUPS)
// groupParents = [0, 0, 0, 2] + [0, 0, ...] (rightpad with 0s to NUM_GROUPS)
// and assuming that address(A) < address(C) < address(E) < address(F) < address(D) < address(B)
// signers = [
//
//	  {addr: address(A), index: 0, group: 0}, {addr: address(C), index: 1, group: 1},
//	  {addr: address(E), index: 2, group: 3}, {addr: address(F), index: 3, group: 3},
//	  {addr: address(D), index: 4, group: 2}, {addr: address(B), index: 5, group: 1},
//	]
type Config struct {
	Signers *cell.Dictionary `tlb:"dict 8"` // map<uint8, Signer> - (indexed)
	/// groupQuorums[i] stores the quorum for the i-th signer group. Any group with
	/// groupQuorums[i] = 0 is considered disabled. The i-th group is successful if
	/// it is enabled and at least groupQuorums[i] of its children are successful.
	GroupQuorums *cell.Dictionary `tlb:"dict 8"` // map<uint8, uint8> (indexed, iterable backwards)
	/// groupParents[i] stores the parent group of the i-th signer group. We ensure that the
	/// groups form a tree structure (where the root/0-th signer group points to itself as
	/// parent) by enforcing
	/// - (i != 0) implies (groupParents[i] < i)
	/// - groupParents[0] == 0
	GroupParents *cell.Dictionary `tlb:"dict 8"` // map<uint8, uint8> (indexed, iterable backwards)
}

// @notice Each root also authenticates metadata about itself (stored as one of the leaves)
// which must be revealed when the root is set.
//
// @dev We need to be careful that abi.encode(MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA, RootMetadata)
// is greater than 64 bytes to prevent collisions with internal nodes in the Merkle tree. See
// openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol:15 for details.
type RootMetadata struct {
	// chainId and multiSig uniquely identify a ManyChainMultiSig contract instance that the
	// root is destined for.
	// int256 since it is unclear if we can represent chainId as uint64 (and TON introduces negative chain IDs).
	// There is a proposal (https://ethereum-magicians.org/t/eip-2294-explicit-bound-to-chain-id/11090) to
	// bound chainid to 64 bits, but it is still unresolved.
	ChainID  *big.Int        `tlb:"## 256"`
	MultiSig address.Address `tlb:"addr"`
	// opCount before adding this root
	PreOpCount uint64 `tlb:"## 40"`
	// opCount after executing all ops in this root
	PostOpCount uint64 `tlb:"## 40"`
	// override whatever root was already stored in this contract even if some of its
	// ops weren't executed.
	// Important: it is strongly recommended that offchain code set this to false by default.
	// Be careful setting this to true as it may break assumptions about what transactions from
	// the previous root have already been executed.
	OverridePreviousRoot bool `tlb:"bool"`
}

// @notice an op to be executed by the ManyChainMultiSig contract
type Op struct {
	ChainID  *big.Int         `tlb:"## 256"` // The chain ID of the operation.
	MultiSig *address.Address `tlb:"addr"`   // The address of the multisig contract.
	Nonce    uint64           `tlb:"## 40"`  // The nonce of the operation.
	To       *address.Address `tlb:"addr"`   // The address to which the operation is directed.
	Value    tlb.Coins        `tlb:"."`      // The value to be sent with the operation. // coins
	Data     *cell.Cell       `tlb:"^"`      // The data to be sent with the operation. // body
}

// --- Constants ---

// Should be used as the first 32 bytes of the pre-image of the leaf that holds a
// op. This value is for domain separation of the different values stored in the
// Merkle tree.
// const MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP = stringSha256_32("MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP")

// Should be used as the first 32 bytes of the pre-image of the leaf that holds the
// root metadata. This value is for domain separation of the different values stored in the
// Merkle tree.
// const MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA = stringSha256_32("MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA")

const (
	// Thrown when number of signers is 0 or greater than MAX_NUM_SIGNERS.
	ErrorOutOfBoundsNumSigners = 100

	// Thrown when signerKeys and signerGroups have different lengths.
	ErrorSignerGroupsLengthMismatch = 101

	// Thrown when number of some signer's group is greater than (NUM_GROUPS-1).
	ErrorOutOfBoundsGroup = 102

	// Thrown when the group tree isn't well-formed.
	ErrorGroupTreeNotWellFormed = 103

	// Thrown when the quorum of some group is larger than the number of signers in it.
	ErrorOutOfBoundsGroupQuorum = 104

	// Thrown when a disabled group contains a signer.
	ErrorSignerInDisabledGroup = 105

	// Thrown when the signers' public keys are not a strictly increasing monotone sequence.
	// Prevents signers from including more than one signature.
	ErrorSignersKeysMustBeStrictlyIncreasing = 106

	// Thrown when the signature corresponds to invalid signer.
	ErrorInvalidSigner = 107

	// Thrown when there is no sufficient set of valid signatures provided to make the
	// root group successful.
	ErrorInsufficientSigners = 108

	// Thrown when attempt to set metadata or execute op for another chain.
	ErrorWrongChainID = 109

	// Thrown when the multiSig address in metadata or op is
	// incompatible with the address of this contract.
	ErrorWrongMultiSig = 110

	// Thrown when the preOpCount <= postOpCount invariant is violated.
	ErrorWrongPostOpCount = 111

	// Thrown when attempting to set a new root while there are still pending ops
	// from the previous root without explicitly overriding it.
	ErrorPendingOps = 112

	// Thrown when preOpCount in metadata is incompatible with the current opCount.
	ErrorWrongPreOpCount = 113

	// Thrown when the provided merkle proof cannot be verified.
	ErrorProofCannotBeVerified = 114

	// Thrown when attempt to execute an op after
	// data.expiringRootAndOpCount.validUntil has passed.
	ErrorRootExpired = 115

	// Thrown when attempt to bypass the enforced ops' order in the merkle tree or
	// re-execute an op.
	ErrorWrongNonce = 116

	// Thrown when attempting to execute an op even though opCount equals
	// metadata.postOpCount.
	ErrorPostOpCountReached = 117

	// Thrown when the underlying call in _execute() reverts.
	ErrorCallReverted = 118

	// Thrown when attempt to set past validUntil for the root.
	ErrorValidUntilHasAlreadyPassed = 119

	// Thrown when setRoot() is called before setting a config.
	ErrorMissingConfig = 120

	// Thrown when attempt to set the same (root, validUntil) in setRoot().
	ErrorSignedHashAlreadySeen = 121
)
