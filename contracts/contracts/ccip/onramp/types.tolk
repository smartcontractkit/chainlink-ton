struct DestChainConfig {
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

struct OnRampDynamicConfig {
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
    add: cell; // vec<address>
    remove: cell; // vec<address>
}




