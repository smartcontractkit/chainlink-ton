import "../router/messages.tolk";
import "types.tolk";

type Msg = OnRampSend | FeeQuoter_MessageValidated<Metadata> | SetDynamicConfig | OnRampUpdateDestChainConfigs | UpdateAllowlists;

// crc32('OnRamp_MessageValidated')
struct (0x1FA60374) OnRamp_MessageValidated<C> {
    msg: Cell<Router_CCIPSend>
    metadata: Cell<C>
    fee: coins
}

struct (0x10000002) OnRamp_Send {
    // queryId is embedded in the first element of CCIPSend
    msg: Cell<CCIPSend>;
    metadata: Metadata
}

struct (0x10000003) OnRamp_SetDynamicConfig {
    config: OnRampDynamicConfig
}

// TODO: make this direct snakedata by using RemainingBitsAndRefs? this way it's not cell->cell
struct (0x10000004) OnRamp_UpdateDestChainConfigs {
    updates: cell; // vec<OnRampUpdateDestChainConfig>
}

// TODO: make this direct snakedata by using RemainingBitsAndRefs? this way it's not cell->cell
struct (0x10000005) OnRamp_UpdateAllowlists {
    updates: cell; // vec<UpdateAllowlist>
}


