import "types"

const CCIP_MESSAGE_SENT_TOPIC: int = stringCrc32("CCIPMessageSent"); 

struct CCIPMessageSent {
    message: TVM2AnyRampMessage;
}

const DEST_CHAIN_CONFIG_SET: int = stringCrc32("DestChainConfigSet");
struct DestChainConfigSet {
    destChainSelector: uint64;
    destChainConfig: DestChainConfig;
}
