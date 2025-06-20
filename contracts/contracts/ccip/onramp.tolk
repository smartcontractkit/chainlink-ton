import "types.tolk";
import "../lib/access/ownable_2step.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "utils.tolk";

// TODO: use sha256("CCIPMessageSent")
const CCIP_MESSAGE_SENT_TOPIC: int = 0x99; // for easier indexing

struct CCIPMessageSent {
    destChainSelector: uint64;
    sequenceNumber: uint64;
    message: CCIPSend;
}

struct Storage {
    ownable: Ownable2Step;

    chainSelector: uint64;
    // TODO: rmnRemote, nonceManager, tokenAdminRegistry
    // hmm, need to consider the design here.
    // probably like solana tokenAdminRegistry will be fused into onramp/router
    // but the problem is unbounded dict growth
    // it's only used to resolve getPoolBySourceToken when calling lockOrBurn
    // maybe onramp -> feeQuoter -> tokenAdminRegistry(token instance) -> tokenPool.LockAndBurn?
    // NOTE: fee quoter also processes pool return data
    // does onramp even do anything apart from forwarding to fee quoter?

    // dynamic config
    config: Cell<DynamicConfig>;

    destChainConfigs: UMap<uint64, DestChainConfig>; // chainSelector -> DestChainConfig;
}

struct DynamicConfig {
    feeQuoter: address;
    // destination address that will receive tokens on withdrawFees
    feeAggregator: address;
    allowlistAdmin: address;
}

struct DestChainConfig {
    router: address;
    sequenceNumber: uint64;
    allowlistEnabled: bool;
    allowedSenders: Map<bool>; // address -> bool;
}
// TODO: move allowlist into accounts
// user calls wallet -> account contract -> router, account verifies dest chain and if
// the user is allowed to send. This will also allow users to deposit funds ahead of time
// unless we intend to keep the allow list small?

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

fun onInternalMessage(msgCell: cell, msgBody: slice) {
}

fun onSend(msg: CCIPSend) {
    val st = Storage.load();
    // TODO: validate message came from router

    // validate allowlist
    val (maybeDestChainConfig, exists) = st.destChainConfigs.get(msg.destChainSelector);
    assert(exists, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
    val destChainConfig = maybeDestChainConfig!;
    if (destChainConfig.allowlistEnabled) {
        // TODO:
    }

    // TODO: validate jetton amounts match msg.tokenAmounts

    // call into feeQuoter to validate and calculate fees
    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: 0,
        dest: st.config.load().feeQuoter,
        body: GetValidatedFee {
            msg,
            // TODO: ...
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_REGULAR);
}

// TODO: do we follow solana model and merge router + onramp?
// aptos also does this
fun onPublish(msg: CCIPSend) {
    var st = Storage.load();
    // validate message originating from trusted fee quoter

    // assign sequence number, we can't do this sooner since the message might fail validation/getFee
    val (maybeDestChainConfig, exists) = st.destChainConfigs.get(msg.destChainSelector);
    assert(exists, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
    var destChainConfig = maybeDestChainConfig!;
    val seqNr = destChainConfig.sequenceNumber;
    destChainConfig.sequenceNumber = destChainConfig.sequenceNumber + 1;
    st.destChainConfigs.set(msg.destChainSelector, destChainConfig);
    st.store();

    emit(CCIP_MESSAGE_SENT_TOPIC, CCIPMessageSent {
        destChainSelector: msg.destChainSelector,
        sequenceNumber: seqNr,
        message: msg
    });

    // notify user
}

get typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.OnRamp", "1.0.0");
 }
