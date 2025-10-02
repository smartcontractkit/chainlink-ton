import "types"
import "../common/messages"
import "../router/messages"

type OnRamp_InMessage =
    | OnRampSend
    | OnRamp_WithdrawJettons
    | OnRamp_ExecutorFinishedSuccessfully
    | Common_JettonTransferNotification
    | SetDynamicConfig
    | OnRampUpdateDestChainConfigs
    | UpdateAllowlists
    ;
    // TODO | UpdateExecutorCode

type OnRamp_NotificationInMessage =
    | OnRampSend
    // TODO refunds from CCIPSendExecutor
    ;

struct (0x10000002) OnRampSend {
    // queryId is embedded in the first element of CCIPSend
    msg: Cell<CCIPSend>;
    metadata: Metadata
}

// crc32('OnRamp_WithdrawJettons')
struct (0x266AEACF) OnRamp_WithdrawJettons {
    msgId: uint224,
    tokens: cell; // vec<TokenAmount>
    onrampJettonWallet: address;
}

struct (0x10000003) SetDynamicConfig {
    config: OnRamp_DynamicConfig
}

// crc32('OnRamp_ExecutorFinishedSuccessfully')
struct (0xCFA6B336) OnRamp_ExecutorFinishedSuccessfully {
    msgId: uint224,
    msg: Cell<CCIPSend>
    metadata: Metadata
    fee: coins
}

// TODO: make this direct snakedata by using RemainingBitsAndRefs? this way it's not cell->cell
struct (0x10000004) OnRampUpdateDestChainConfigs {
    updates: cell; // vec<OffRampUpdateDestChainConfig>
}

// TODO: make this direct snakedata by using RemainingBitsAndRefs? this way it's not cell->cell
struct (0x10000005) UpdateAllowlists {
    updates: cell; // vec<UpdateAllowlist>
}

struct WithdrawFeeTokens {}

