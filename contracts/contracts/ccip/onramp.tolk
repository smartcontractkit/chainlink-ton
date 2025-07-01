import "types.tolk";
import "../lib/access/ownable_2step.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "utils.tolk";
import "../lib/utils.tolk";

// TODO: use sha256("CCIPMessageSent")
const CCIP_MESSAGE_SENT_TOPIC: int = 0x99; // for easier indexing

struct CCIPMessageSent {
    destChainSelector: uint64;
    sequenceNumber: uint64;
    message: CCIPSend;
}

struct Storage {
    ownable: Ownable2Step;

    // static config
    chainSelector: uint64; // source chain selector
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
    router: address; // TODO: probably just bytes
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

type Msg = OnRampSend | Publish;

fun onInternalMessage(msgCell: cell, msgBody: slice) {
    // TODO: does this waste gas?
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs     = msgCell.beginParse();
    val flags  = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { return; } // ignore all bounced messages
    val sender = cs.loadAddress();

    val msg = Msg.fromSlice(msgBody);
    match (msg) {
        OnRampSend => {
            onSend(msg, sender)
        }
        Publish => { onPublish(msg.msg.load(), sender) }
    }
}

fun onSend(payload: OnRampSend, sender: address) {
    val st = Storage.load();
    // TODO: validate message came from router

    val msg = payload.msg.load();

    // validate allowlist
    val destChainConfig = st.destChainConfigs.mustGetRef(msg.destChainSelector, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
    if (destChainConfig.allowlistEnabled) {
        // TODO:
        // val (allowed, exists) = destChainConfig.allowedSenders.get(sender);
        // assert(exists && allowed!, ERROR_SENDER_NOT_ALLOWED);
    }

    // TODO: validate jetton amounts match msg.tokenAmounts

    // call into feeQuoter to validate and calculate fees
    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: ton("0.05"), // TODO:
        dest: st.config.load().feeQuoter,
        body: GetValidatedFee {
            msg,
            caller: contract.getAddress(),
            // TODO: ...
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_REGULAR);

    // TEMP: publish so we unblock e2e
    // onPublish(msg, sender);
}

// TODO: do we follow solana model and merge router + onramp? aptos also does this
fun onPublish(msg: CCIPSend, sender: address) {
    var st = Storage.load();
    // TODO: validate message originating from trusted fee quoter

    // assign sequence number, we can't do this sooner since the message might fail validation/getFee
    var destChainConfig = st.destChainConfigs.mustGetRef(msg.destChainSelector, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
    val seqNr = destChainConfig.sequenceNumber;
    destChainConfig.sequenceNumber = destChainConfig.sequenceNumber + 1;
    st.destChainConfigs.set(msg.destChainSelector, destChainConfig);
    st.store();

    emit(CCIP_MESSAGE_SENT_TOPIC, CCIPMessageSent {
        destChainSelector: msg.destChainSelector,
        sequenceNumber: seqNr,
        message: msg
    });

    // TODO: notify user
}

get typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.OnRamp", "1.0.0");
 }
