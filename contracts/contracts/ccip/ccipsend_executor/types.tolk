// SPDX-License-Identifier: BUSL-1.1
import "../onramp/messages.tolk";
import "../fee_quoter/types"

const CCIPSendExecutor_FACILITY_NAME = "link.chain.ton.ccip.CCIPSendExecutor";
const CCIPSendExecutor_FACILITY_ID = CCIPSendExecutor_FACILITY_NAME.crc32() % 640 + 10;  // 178
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions

type CCIPSendExecutor_ID = uint224

struct CCIPSendExecutor_InitialData {
    onramp: address,
    id: CCIPSendExecutor_ID,
}

struct CCIPSendExecutor_Data {
    id: CCIPSendExecutor_ID,
    onrampSend: OnRamp_Send,
    addresses: Cell<CCIPSendExecutor_Addresses>,
    state: CCIPSendExecutor_State,
}

struct CCIPSendExecutor_Addresses {
    onramp: address,
    feeQuoter: address,
    tokenRegistry: address?,
}

type CCIPSendExecutor_State =
    | Cell<CCIPSendExecutor_State_Initialized>
    | Cell<CCIPSendExecutor_State_OnGoingFeeValidation>
    | Cell<CCIPSendExecutor_State_TokenRegistryAccess>
    | Cell<CCIPSendExecutor_State_TokenTransfer>
    | Cell<CCIPSendExecutor_State_Finalized>

struct CCIPSendExecutor_State_Initialized {
}

struct CCIPSendExecutor_State_OnGoingFeeValidation {
}

struct CCIPSendExecutor_State_TokenRegistryAccess {
    fee: Fee,
}

// TODO Impl wallet address validation through JettonMinter/ stored wallet code
// TODO By default, the Executor should JettonWallet address validation via async req/resp with the JettonMinter
// Unless explicitly disabled by TokenRegistry info, then this is skipped and handed off to the TP (which indicates it has the code stored and will verify locally/synchronously).
struct CCIPSendExecutor_State_WalletAddressValidation {
}

struct CCIPSendExecutor_State_TokenTransfer {
    tokenPool: address,
    fee: Fee,
}

struct CCIPSendExecutor_State_Finalized {
}

//TODO deprecate with tt
struct CCIPSendExecutor_Config {
    feeQuoter: address,
}

struct CCIPSendExecutor_ConfigV2 {
    feeQuoter: address,
    tokenRegistry: address?,
}


