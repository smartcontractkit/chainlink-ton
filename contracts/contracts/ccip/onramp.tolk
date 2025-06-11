import "types.tolk";
import "utils.tolk";

// TODO: use sha256("CCIPMessageSent")
const CCIP_MESSAGE_SENT_TOPIC: int = 0x99; // for easier indexing

struct CCIPMessageSent {
    destChainSelector: uint64;
    sequenceNumber: uint64;
    message: CCIPSend;
}

struct Storage {
    owner: address;

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
}

struct DynamicConfig {
    feeQuoter: address;
    // destination address that will receive tokens on withdrawFees
    feeAggregator: address;
    allowlistAdmin: address;
}

// struct DestChainConfig has store, drop {
//     sequence_number: u64,
//     allowlist_enabled: bool,
//     router: address,
//     allowed_senders: vector<address>
// }
// TODO: move allowlist into accounts
// user calls wallet -> account contract -> router, account verifies dest chain and if
// the user is allowed to send. This will also allow users to deposit funds ahead of time
// unless we intend to keep the allow list small?

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun onInternalMessage(msgCell: cell, msgBody: slice) {
}

fun onSend(msg: CCIPSend) {
    val st = Storage.load();

    // call into fee_quoter to validate and calculate fees
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
fun onPublish(msg: CCIPSend) {
    // validate message originating from trusted fee quoter

    emit(CCIP_MESSAGE_SENT_TOPIC, CCIPMessageSent {
        destChainSelector: 0, // TODO:
        sequenceNumber: 0, // TODO:
        message: msg
    });

    // notify user
}

// TypeAndVersion

// fun type(): String {
//     return "com.chainlink.ton.ccip.OnRamp";
// }

// fun version(): String {
//     return "1.0.0";
// }
