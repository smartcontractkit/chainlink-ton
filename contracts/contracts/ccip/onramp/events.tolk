// SPDX-License-Identifier: BUSL-1.1
import "types"

const CCIP_MESSAGE_SENT_TOPIC: int = stringCrc32("CCIPMessageSent"); 

struct CCIPMessageSent {
    message: TVM2AnyRampMessage;
}

const DEST_CHAIN_SELECTOR_ADDED_TOPIC: int = stringCrc32("DestChainSelectorAdded");
struct DestChainSelectorAdded {
    destChainSelector: uint64;
}

const DEST_CHAIN_CONFIG_UPDATED_TOPIC: int = stringCrc32("DestChainConfigUpdated");
struct DestChainConfigUpdated {
    destChainSelector: uint64;
    destChainConfig: OnRamp_DestChainConfig;
}

const CONFIG_SET_TOPIC: int = stringCrc32("ConfigSet");
struct ConfigSet {
    chainSelector: uint64;
    dynamicConfig: OnRamp_DynamicConfig;
}
