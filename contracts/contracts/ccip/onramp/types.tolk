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

// The token-transfer portion of a ramp message. `tokenAmounts` is the source-chain
// amount(s) supplied by the sender; `destTokenAddress` is the destination-chain token
// address returned by the token pool's lockOrBurn (LockOrBurnOutV1.destTokenAddress),
// which offchain nodes read to build the release/mint on the destination chain.
// The current flow supports a single token transfer, so there is one destTokenAddress
// rather than one per tokenAmounts entry; it is empty when the message carries no
// token transfer.
struct TVM2AnyTokenTransfer {
    tokenAmounts: SnakedCell<TokenAmount>;
    destTokenAddress: Cell<CrossChainAddress>;
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
