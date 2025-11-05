import "../common/types"
import "../../lib/utils"

struct OnRamp_DestChainConfig {
    router: address; // Local router address that is allowed to send messages to the destination chain.
    sequenceNumber: uint64;
    allowlistEnabled: bool;
    allowedSenders: map<address, bool>;
}
// TODO: move allowlist into accounts
// user calls wallet -> account contract -> router, account verifies dest chain and if
// the user is allowed to send. This will also allow users to deposit funds ahead of time
// unless we intend to keep the allow list small?
// nonceManager: also seems to fit best in a sender subcontract with a dict destChainSelector -> nonce
// if we pass through account contract then we can grab a nonce and pass it through?

struct OnRamp_DynamicConfig {
    feeQuoter: address;
    // destination address that will receive tokens on withdrawFees
    feeAggregator: address;
    allowlistAdmin: address;
}

struct OnRampUpdateDestChainConfig {
    destChainSelector: uint64;
    router: address;
    allowlistEnabled: bool;
}

struct UpdateAllowlist {
    destChainSelector: uint64;
    add: SnakedCell<address>;
    remove: SnakedCell<address>
}

struct Metadata {
    sender: address,
    // TODO: metadata { value, tokenAmounts }
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
    extraArgs: cell;
    tokenAmounts: cell;
    feeToken: address;
    feeTokenAmount: uint256;
}

fun TVM2AnyRampMessage.generateMessageId(self, metadataHash: uint256): uint256 {
    // Loosely based on https://github.com/smartcontractkit/chainlink/blob/d1a9f8be2f222ea30bdf7182aaa6428bfa605cf7/contracts/src/v0.8/ccip/libraries/Internal.sol#L137-L154
    return beginCell()
        .storeSlice(LEAF_DOMAIN_SEPARATOR)
        .storeUint(metadataHash, 256)
        // header
        .storeAddress(self.sender)
        .storeUint(self.header.sequenceNumber, 64)
        .storeUint(self.header.nonce, 64)
        // message
        .storeRef(self.body) // receiver, data, extraArgs, tokenAmounts, feeToken (addr, amount) NOTE: feeValueJuels deliberately excluded
        .endCell()
        .hash()
}


