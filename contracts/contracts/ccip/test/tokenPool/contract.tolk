import "../../pools/lib/token_pool/entrypoint"
import "../../pools/lib/token_pool/messages"


contract MockTokenPool {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.6.1"
    description: "link.chain.ton.ccip.test.TokenPool"
	storage: Storage
    incomingMessages: TokenPool_InMessage
}

const CONTRACT_VERSION = "0.0.1".literalSlice();

struct Storage {
	poolData: Cell<TokenPool_Data>
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    contract.setData(self.toCell());
}

fun loadPool(st: Storage): TokenPool<Storage> {
	return TokenPool<Storage> {
        data: st.poolData.load(),
        context: st,
        hooks: TokenPool_Hooks<Storage> {
            ensureOutboundAccess: null,
            ensureInboundAccess: null,
            ensureNotCursed: null,
            onLockOrBurn: null,
            validateLockOrBurn: null,
            preflightCheck: null,
            onLockOrBurnTransfer: null,
            onLockOrBurnTransferContinue: null,
            onReleaseOrMint: null,
            validateReleaseOrMint: null,
            postflightCheck: null,
            onReleaseOrMintContinue: null,
            onWithdrawFeeTokens: null,
        },
    };
}

fun onInternalMessage(in: InMessage) {
	var st = Storage.load();
    var pool = loadPool(st);
    val handled = pool.onInternalMessage(in.senderAddress, in.valueCoins, in.body);
    if (handled) {
        st = pool.context != null ? pool.context! : st;
        st.poolData = pool.data.toCell();
        st.store();
        return;
    }
	
	assert(in.body.isEmpty()) throw 0xFFFF;
}
 