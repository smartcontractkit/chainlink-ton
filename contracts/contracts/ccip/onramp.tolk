import "@stdlib/lisp-lists"
import "types.tolk";
import "../lib/access/ownable_2step.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "../lib/utils.tolk";
import "@stdlib/tvm-dicts";

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
    router: address;
    chainSelector: uint64; // source chain selector
    // TODO: rmnRemote (only used to validate curse on getFee), nonceManager, tokenAdminRegistry
    // hmm, need to consider the design here.
    // probably like solana tokenAdminRegistry will be fused into onramp/router
    // but the problem is unbounded dict growth
    // it's only used to resolve getPoolBySourceToken when calling lockOrBurn
    // maybe onramp -> feeQuoter -> tokenAdminRegistry(token instance) -> tokenPool.LockAndBurn?
    // NOTE: fee quoter also processes pool return data

    // dynamic config
    config: Cell<OnRampDynamicConfig>;

    destChainConfigs: UMap<uint64, DestChainConfig>; // chainSelector -> DestChainConfig
}

struct DestChainConfig {
    router: bytes64;
    sequenceNumber: uint64;
    allowlistEnabled: bool;
    allowedSenders: Map<bool>; // address -> bool
}
// TODO: move allowlist into accounts
// user calls wallet -> account contract -> router, account verifies dest chain and if
// the user is allowed to send. This will also allow users to deposit funds ahead of time
// unless we intend to keep the allow list small?

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

type Msg = OnRampSend | MessageValidated<Metadata> | SetDynamicConfig | OnRampUpdateDestChainConfigs;

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        OnRampSend => { send(msg, in.senderAddress) }
        MessageValidated<Metadata> => { onMessageValidated(msg, in.senderAddress) }
        SetDynamicConfig => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            st.config = msg.config.toCell();
            st.store();
        }
        OnRampUpdateDestChainConfigs => {
            var st = lazy Storage.load();
            st.ownable.requireOwner(in.senderAddress);
            applyDestChainConfigUpdates(mutate st, msg.updates);
            st.store();
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun send(payload: OnRampSend, sender: address) {
    val st = lazy Storage.load();
    // ccipSend must be forwarded from the router
    assert(st.router == sender, ERROR_SENDER_NOT_ALLOWED);

    val msg = payload.msg.load();

    // validate allowlist
    val destChainConfig = st.destChainConfigs.mustGet(msg.destChainSelector, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
    if (destChainConfig.allowlistEnabled) {
        // TODO:
        val (allowed, exists) = destChainConfig.allowedSenders.get(sender);
        assert(exists && allowed!, ERROR_SENDER_NOT_ALLOWED);
    }

    // TODO: validate jetton amounts match msg.tokenAmounts

    // call into feeQuoter to validate and calculate fees
    val getValidatedFeeMsg = createMessage({
        bounce: true,
        value: ton("0.05"), // TODO:
        dest: st.config.load().feeQuoter,
        body: GetValidatedFee<Metadata> {
            msg: payload.msg,
            metadata: Metadata {
                caller: contract.getAddress(),
                // TODO: ...
            }.toCell() 
        }
    });
    getValidatedFeeMsg.send(SEND_MODE_REGULAR);
}

// TODO: do we follow solana model and merge router + onramp? aptos also does this
// does onramp even do anything apart from forwarding to fee quoter?
fun onMessageValidated(payload: MessageValidated<Metadata>, sender: address) {
    var st = lazy Storage.load();
    val config = st.config.load();
    // notification must come from fee quoter
    assert(config.feeQuoter == sender, ERROR_SENDER_NOT_ALLOWED);

    val msg = payload.msg.load();

    // validate user transferred enough value
    // else refund and notify

    // assign sequence number, we can't do this sooner since the message might fail validation/getFee
    var destChainConfig = st.destChainConfigs.mustGet(msg.destChainSelector, ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
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

get fun isChainSupported(destChainSelector: uint64): bool {
    val st = lazy Storage.load();
    val (_, exists) = st.destChainConfigs.get(destChainSelector);
    return exists;
}

get fun expectedNextSequenceNumber(destChainSelector: uint64): uint64 {
    val st = lazy Storage.load();
    val config = st.destChainConfigs.mustGet(destChainSelector,ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
    return config.sequenceNumber;
}

// TODO: getFee forwarding? users should just call the fee quoter

get fun staticConfig() {
    // chainSelector, rmnRemote, nonceManager, tokenAdminRegistry
}

get fun dynamicConfig(): OnRampDynamicConfig {
    val st = lazy Storage.load();
    return st.config.load()
}

fun applyDestChainConfigUpdates(mutate st: Storage, updates: cell) {
    var iter = Iterator<OnRampUpdateDestChainConfig>.new(updates);

    while (!iter.empty()) {
        val update = iter.next();
        // create or update entries
        val (maybeConfig, exists) = st.destChainConfigs.get(update.destChainSelector);
        if (exists) {
            var config = maybeConfig!;
            config.router = update.router;
            config.allowlistEnabled = update.allowlistEnabled;
            st.destChainConfigs.replace(update.destChainSelector, config);
        } else {
            st.destChainConfigs.set(update.destChainSelector, DestChainConfig {
                router: update.router,
                sequenceNumber: 0,
                allowlistEnabled: update.allowlistEnabled,
                allowedSenders: Map<bool>.new(),
            })
        }
    }
}

get fun destChainConfig(destChainSelector: uint64): DestChainConfig {
    val st = lazy Storage.load();
    return st.destChainConfigs.mustGet(destChainSelector,ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
}

// vec<address>
get fun allowedSendersList(destChainSelector: uint64): tuple {
    val st = lazy Storage.load();
    val config = st.destChainConfigs.mustGet(destChainSelector,ERROR_UNKNOWN_DEST_CHAIN_SELECTOR);
    var d = config.allowedSenders.value;

    var list: tuple? = null;
    do {
        var (key: slice?, _value: slice?, found: bool) = d.sDictDeleteFirstAndGet(ADDR_KEY_LEN);
        if (found) {
            // var (wc, addressHash) = (key! as address).getWorkchainAndHash();
            // list = listPrepend([wc, addressHash], list);
            var address = key! as address;
            list = listPrepend(address, list);
        }
    } while (found);

    return list!;
}

fun applyAllowlistUpdates() {
}

// outboundNonce() TODO: nonceManager?
// calculateMetadataHash/calculateMessageHash

get fun supportedTokens() {
    // TODO?
}


fun withdrawFeeTokens() {
    
}

get fun typeAndVersion(): (slice, slice) {
     return ("com.chainlink.ton.ccip.OnRamp", "1.0.0");
 }
