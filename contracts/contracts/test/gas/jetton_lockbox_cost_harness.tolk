// SPDX-License-Identifier: BUSL-1.1
// Test-only harness exposing the JettonLockBox cost model as getters.
//
// The lockbox gas-report test compares these on-chain estimates with measured sandbox gas so the
// value checks and the measured costs stay in lockstep.

import "@stdlib/common.tolk"
import "@stdlib/gas-payments"

import "../../ccip/pools/lockbox/costs"
import "../../ccip/pools/lockbox/messages"
import "../../lib/jetton/messages"
import "../../lib/jetton/forward_payload_wrap"

contract JettonLockBoxCostHarness {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.test.gas.JettonLockBoxCostHarness"
}

fun onInternalMessage(in: InMessage) {
    assert (in.body.isEmpty()) throw 0xFFFF
}

get fun get_depositGasUnits(): int { return JettonLockBox_DEPOSIT_GAS_UNITS; }
get fun get_withdrawGasUnits(): int { return JettonLockBox_WITHDRAW_GAS_UNITS; }

get fun get_depositMinValue(fwdFee: coins): coins {
    return JettonLockBox_minDepositValue(fwdFee);
}

/// Test-only estimate of the `JettonLockBox_Deposited` reply fee for the deposit shape.
get fun get_depositReplyFee(queryId: uint64, amount: coins, depositContext: cell?): coins {
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: contract.getAddress(),
        body: JettonLockBox_Deposited {
            queryId,
            token: contract.getAddress(),
            depositor: contract.getAddress(),
            amount,
            context: depositContext,
        },
    });
    return reply.estimateFeeWithoutSending(SEND_MODE_CARRY_ALL_BALANCE);
}

get fun get_withdrawMinValue(forwardTonAmount: coins, fwdFee: coins): coins {
    return JettonLockBox_minWithdrawValue(forwardTonAmount, fwdFee);
}

/// Test-only estimate of the `AskToTransfer` forward fee for the exact withdraw shape.
/// Mirrors `onWithdraw` so the reported minimum matches the lockbox's on-chain guard.
get fun get_withdrawFwdFee(
    withdraw: cell,
    sender: address,
    walletAddress: address,
    lockboxAddress: address,
): coins {
    val msg = JettonLockBox_Withdraw.fromCell(withdraw);

    val extra = msg.extra != null ? msg.extra.load() : null;
    val sendExcessesTo = extra != null && extra.sendExcessesTo != null
        ? extra.sendExcessesTo
        : lockboxAddress;
    val forwardTonAmount = extra != null ? extra.forwardTonAmount : 0 as coins;
    val delivered = Jetton_ForwardPayloadWrap.unwrapForwardPayload(
        extra != null ? extra.forwardPayload : null
    );

    val wrap = Jetton_ForwardPayloadWrap {
        initiator: sender,
        context: withdraw,
        forwardPayload: delivered,
    };

    val transferOpts = CreateMessageOptions<AskToTransfer> {
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: walletAddress,
        body: AskToTransfer {
            queryId: msg.queryId,
            jettonAmount: msg.amount,
            transferRecipient: msg.recipient,
            sendExcessesTo,
            customPayload: null,
            forwardTonAmount,
            forwardPayload: wrap.asForwardPayload(),
        },
    };

    val sendMode = SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL;
    return createMessage(transferOpts).estimateFeeWithoutSending(sendMode);
}

/// Price measured gas with the same on-chain config the cost functions use.
get fun get_calculateGasFee(gasUsed: int): coins {
    return calculateGasFee(contract.getAddress().getWorkchain(), gasUsed);
}
