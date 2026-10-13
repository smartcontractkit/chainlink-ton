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
    router: address,
    feeQuoter: address,
    tokenRegistry: Cell<address>?,
}

type CCIPSendExecutor_State =
    | Cell<CCIPSendExecutor_State_Initialized>
    | Cell<CCIPSendExecutor_State_OnGoingFeeValidation>
    | Cell<CCIPSendExecutor_State_TokenRegistryAccess>
    | Cell<CCIPSendExecutor_State_TokenPool_LockOrBurn>
    | Cell<CCIPSendExecutor_State_TokenPool_Withdraw>
    | Cell<CCIPSendExecutor_State_Finalized>

struct CCIPSendExecutor_State_Initialized {
}

struct CCIPSendExecutor_State_OnGoingFeeValidation {
}

struct CCIPSendExecutor_State_TokenRegistryAccess {
    fee: Fee,
    token: address,
    destGasOverhead: uint32,
}

struct CCIPSendExecutor_State_TokenPool_LockOrBurn {
    fee: Fee,
    destGasOverhead: uint32,
    tokenPool: address,
}

struct CCIPSendExecutor_State_TokenPool_Withdraw {
    fee: Fee,
    destGasOverhead: uint32,
    tokenPool: address,
}

struct CCIPSendExecutor_State_Finalized {
}

struct CCIPSendExecutor_Config {
    router: address,
    feeQuoter: address,
    tokenRegistry: address?,
}
