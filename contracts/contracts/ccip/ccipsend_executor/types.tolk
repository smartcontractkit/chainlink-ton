// SPDX-License-Identifier: BUSL-1.1
import "../onramp/messages.tolk";
import "../fee_quoter/types"

const CCIPSendExecutor_FACILITY_NAME = "link.chain.ton.ccip.CCIPSendExecutor";
const CCIPSendExecutor_FACILITY_ID = 178;  // (crc32(<facility>) % 640) + 10

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
    tokenRegistry: address,
}

type CCIPSendExecutor_State =
    | Cell<CCIPSendExecutor_State_Initialized>
    | Cell<CCIPSendExecutor_State_OnGoingFeeValidation>
    | Cell<CCIPSendExecutor_State_Finalized>

struct CCIPSendExecutor_State_Initialized {
}

struct CCIPSendExecutor_State_OnGoingFeeValidation {
}

struct CCIPSendExecutor_State_TokenRegistryAccess {
    fee: Fee,
}

//TODO Impl wallet address validation through JettonMinter/ stored wallet code
struct CCIPSendExecutor_State_WalletAddressValidation {
}

struct CCIPSendExecutor_State_TokenTransfer {
    tokenPool: address,
    fee: Fee,
}

struct CCIPSendExecutor_State_Finalized {
}

struct CCIPSendExecutor_Config {
    feeQuoter: address,
    tokenRegistry: address,
}


