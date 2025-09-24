import "../router/messages.tolk";
import "types.tolk";

type OnRamp_InMessage = OnRamp_Send | OnRamp_MessageValidated<Metadata> | OnRamp_SetDynamicConfig | OnRamp_UpdateDestChainConfigs | OnRamp_UpdateAllowlists;

// crc32('OnRamp_MessageValidated')
struct (0x1FA60374) OnRamp_MessageValidated<C> {
    msg: Cell<Router_CCIPSend>
    metadata: Cell<C>
    fee: coins
}

struct (0x10000002) OnRamp_Send {
    // queryId is embedded in the first element of CCIPSend
    msg: Cell<Router_CCIPSend>;
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


