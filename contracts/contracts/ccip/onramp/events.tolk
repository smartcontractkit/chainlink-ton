// SPDX-License-Identifier: BUSL-1.1
import "types"

const CCIP_MESSAGE_SENT_V2_TOPIC: int = "CCIPMessageSentV2".crc32();

struct CCIPMessageSentV2 {
    message: TVM2AnyRampMessage;
}

const DEST_CHAIN_SELECTOR_ADDED_TOPIC: int = "DestChainSelectorAdded".crc32();
struct DestChainSelectorAdded {
    destChainSelector: uint64;
}

const DEST_CHAIN_CONFIG_UPDATED_TOPIC: int = "DestChainConfigUpdated".crc32();
struct DestChainConfigUpdated {
    destChainSelector: uint64;
    destChainConfig: OnRamp_DestChainConfig;
}

const CONFIG_SET_TOPIC: int = "ConfigSet".crc32();
struct ConfigSet {
    chainSelector: uint64;
    dynamicConfig: OnRamp_DynamicConfig;
}
