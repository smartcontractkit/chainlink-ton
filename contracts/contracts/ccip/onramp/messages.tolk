import "types"
import "../common/types"
import "../common/messages"
import "../router/messages"
import "../../lib/utils"

type OnRamp_InMessage =
    | OnRamp_Send
    | OnRamp_WithdrawJettons
    | OnRamp_ExecutorFinishedSuccessfully
    | OnRamp_SetDynamicConfig
    | OnRamp_UpdateDestChainConfigs
    | OnRamp_UpdateAllowlists
    | Common_JettonTransferNotification
    ;
    // TODO | UpdateExecutorCode

type OnRamp_NotificationInMessage =
    | OnRamp_Send
    // TODO refunds from CCIPSendExecutor
    ;

struct (0x10000002) OnRamp_Send {
    // queryId is embedded in the first element of CCIPSend
    msg: Cell<Router_CCIPSend>;
    metadata: Metadata
}

// crc32('OnRamp_WithdrawJettons')
struct (0x266AEACF) OnRamp_WithdrawJettons {
    msgId: uint224,
    tokens: SnakedCell<TokenAmount>;
    onrampJettonWallet: address;
}

struct (0x10000003) OnRamp_SetDynamicConfig {
    config: OnRamp_DynamicConfig
}

// crc32('OnRamp_ExecutorFinishedSuccessfully')
struct (0xCFA6B336) OnRamp_ExecutorFinishedSuccessfully {
    msgId: uint224,
    msg: Cell<Router_CCIPSend>
    metadata: Metadata
    fee: coins
}

// TODO: make this direct snakedata by using RemainingBitsAndRefs? this way it's not cell->cell
struct (0x10000004) OnRamp_UpdateDestChainConfigs {
    updates: cell; // vec<OffRampUpdateDestChainConfig>
}

// TODO: make this direct snakedata by using RemainingBitsAndRefs? this way it's not cell->cell
struct (0x10000005) OnRamp_UpdateAllowlists {
    updates: cell; // vec<UpdateAllowlist>
}

struct WithdrawFeeTokens {}

