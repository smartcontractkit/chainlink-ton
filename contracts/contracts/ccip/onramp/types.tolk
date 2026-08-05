// SPDX-License-Identifier: BUSL-1.1
import "../common/types"
import "../ccipsend_executor/types"
import "../../lib/utils"
import "../../lib/deployable/namespace"

const OnRamp_FACILITY_NAME = "link.chain.ton.ccip.OnRamp";
const OnRamp_FACILITY_ID = OnRamp_FACILITY_NAME.crc32() % 640 + 10;  // 134
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

struct OnRamp_DestChainConfig {
    router: address; // Local router address that is allowed to send messages to the destination chain.
    sequenceNumber: uint64;
    allowlistEnabled: bool;
    allowedSenders: map<address, bool>;
}

struct OnRamp_DynamicConfig {
    feeQuoter: address;
    // destination address that will receive tokens on withdrawFees
    feeAggregator: address;
    allowlistAdmin: address;
    reserve: coins;
}

struct OnRampUpdateDestChainConfig {
    destChainSelector: uint64;
    router: address;
    allowlistEnabled: bool;
}

struct ExecutorDeployment {
    deployableCode: cell;
    executorCode: cell; // code for SendExecutor
}

@inline
fun ExecutorDeployment.autoDeployAddress(self, executorID: CCIPSendExecutor_ID): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code: self.deployableCode,
            data: NamespacedDeployableData({
                namespace: DeployableNamespace_CCIPSendExecutor,
                owner: contract.getAddress(),
                id: executorID,
            }),
        }
    }
}

struct UpdateAllowlist {
    destChainSelector: uint64;
    add: SnakedCell<address>;
    remove: SnakedCell<address>
}

struct Metadata {
    sender: address,
    /// Value sent by the sender in the Router's entrypoint
    value: coins,
}

struct TVM2AnyRampMessageV1Metadata {
    _header: uint256 = "TVM2AnyMessageHashV1".sha256();
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    onRamp: address;
}

struct TVM2AnyRampMessage {
    header: RampMessageHeader;
    sender: address;
    body: Cell<TVM2AnyRampMessageBody>;
    feeValueJuels: uint96; // entire supply of LINK always fits into u96
}

struct TVM2AnyRampMessageBody {
    receiver: Cell<CrossChainAddress>;
    data: cell;
    extraArgs: Cell<ExtraArgs>;
    tokenTransfer: Cell<TVM2AnyTokenTransfer>;
    feeToken: address;
    feeTokenAmount: coins;
}

// The token-transfer portion of a ramp message. Mirrors SVM2AnyTokenTransfer /
// EVM2AnyTokenTransfer on the other chain families so offchain nodes can build the
// release/mint on the destination chain.
//
// The current flow supports a single token transfer, so this is one struct rather than
// a list; `tokenAmounts` (the source-chain amount(s) supplied by the sender) is kept
// alongside it because it is the only place the local jetton address is carried.
// All pool-supplied fields are zero/empty when the message carries no token transfer.
struct TVM2AnyTokenTransfer {
    // The source pool address on TON. This value is trusted: the OnRamp sets it from the
    // pool it actually routed the lockOrBurn to, so the destination pool can rely on it.
    sourcePoolAddress: address;
    // Cross-chain token amount, always a u256 to match the other chain families. This is
    // the post-fee amount the pool reported (LockOrBurnFinished.destTokenAmount), which
    // may differ from tokenAmounts[0].amount (the pre-fee amount the sender supplied).
    amount: uint256;
    // Source-chain amount(s) and local jetton address supplied by the sender.
    tokenAmounts: SnakedCell<TokenAmount>;
    // The address of the destination token, abi encoded in the case of EVM chains.
    // This value is UNTRUSTED as any pool owner can return whatever value they want.
    destTokenAddress: Cell<CrossChainAddress>;
    // Optional pool data to be transferred to the destination chain
    // (LockOrBurnOutV1.destPoolData). By default this is capped at
    // CCIP_LOCK_OR_BURN_V1_RET_BYTES bytes; if more is required, the
    // TokenTransferFeeConfig.destBytesOverhead has to be set for the specific token.
    extraData: cell;
    // Destination chain data used to execute the token transfer on the destination chain.
    // For an EVM destination it is the gas available for the releaseOrMint and transfer
    // calls made by the offRamp.
    // TODO: always empty today. The FeeQuoter holds the per-token destGasOverhead in
    // TokenTransferFeeConfig, but its fee path still rejects token transfers outright, so
    // nothing produces this value yet. Populate it once the FeeQuoter supports them.
    destExecData: cell;
}

// The pool-supplied portion of a token transfer, forwarded from the CCIPSendExecutor to
// the OnRamp. Kept in its own cell because these fields plus the executor's own do not
// fit in a single cell alongside the ramp message.
struct OnRamp_ExecutorTokenTransfer {
    sourcePoolAddress: address;
    amount: uint256;
    destTokenAddress: Cell<CrossChainAddress>;
    extraData: cell;
    destExecData: cell;
}

// A token transfer with every field zeroed, used when a send carries no token transfer.
fun emptyExecutorTokenTransfer(): Cell<OnRamp_ExecutorTokenTransfer> {
    return OnRamp_ExecutorTokenTransfer {
        sourcePoolAddress: createAddressNone() as address,
        amount: 0,
        // An empty CrossChainAddress is a 0-byte length prefix.
        destTokenAddress: beginCell().storeUint(0, 8).endCell() as Cell<CrossChainAddress>,
        extraData: createEmptyCell(),
        destExecData: createEmptyCell(),
    }.toCell();
}

fun TVM2AnyRampMessage.generateMessageId(self, metadataHash: uint256): uint256 {
    // Loosely based on https://github.com/smartcontractkit/chainlink/blob/d1a9f8be2f222ea30bdf7182aaa6428bfa605cf7/contracts/src/v0.8/ccip/libraries/Internal.sol#L137-L154
    return TVM2AnyRampMessageIDData{
        metadataHash,
        metadata: TVM2AnyRampMessageIDHeader {
            sender: self.sender,
            sequenceNumber: self.header.sequenceNumber,
            nonce: self.header.nonce,
        },
        body: self.body, // receiver, data, extraArgs, tokenAmounts, feeToken (addr, amount) NOTE: feeValueJuels deliberately excluded
    }.toCell().hash();
}

struct TVM2AnyRampMessageIDData {
    _leafDomainSeparator: bits256 = LEAF_DOMAIN_SEPARATOR;
    metadataHash: uint256;
    metadata: TVM2AnyRampMessageIDHeader;
    body: cell;
}

struct TVM2AnyRampMessageIDHeader {
    sender: address;
    sequenceNumber: uint64;
    nonce: uint64;
}
