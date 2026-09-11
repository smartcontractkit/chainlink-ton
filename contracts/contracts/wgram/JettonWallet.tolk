// SPDX-License-Identifier: MIT
tolk 1.4.1

// DISCLAIMER
//
// This code represents an example of using a Chainlink product or service, and is intended for
// demonstration and educational purposes only. It is provided “AS IS” and “AS AVAILABLE” without
// warranties of any kind, has not been audited, and may omit checks or error handling. Each party
// intending to use this example code does so entirely at their own risk and must perform its own
// audits, security and code review, key management, and testing before any production deployment
// and ensure the operation and performance of such code matches expectations. Neither Chainlink
// Labs nor the Chainlink Foundation deploys, operates, monitors, maintains or endorses any
// deployment of this code. Note that this is not a Chainlink product, feature or service, and
// there are no commitments made with respect to the code, including compatibility with future
// Chainlink releases. You should not rely on this code without first conducting your own
// technical, engineering, and security review. This code is also outside the scope of any
// Chainlink bug bounty programs. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink
// node operators are responsible for outcomes due to errors in this example or how it is deployed
// or operated, or liable for any resulting claims or damages. Use of the Chainlink Network is
// subject to the Chainlink Foundation Terms of Service (https://chain.link/terms), which provides
// important information and disclosures. By using this code, you acknowledge and agree to these
// terms.

import "@stdlib/gas-payments"
import "../lib/jetton/errors"
import "../lib/jetton/jetton-utils"
import "../lib/jetton/storage"
import "../lib/jetton/messages"
import "fees-management"

contract JettonWallet {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.0.1"
    description: "link.chain.ton.wgram.JettonWallet"

    storage: WalletStorage
    incomingMessages: AllowedMessageToWallet
}

// Lets the wallet owner withdraw any GRAM surplus sitting above the strict `jettonBalance + storage_fee`
struct (0xf2ff646f) AskToWithdrawExcess {
    queryId: uint64
    sendExcessesTo: address
}

type AllowedMessageToWallet =
    | AskToTransfer
    | AskToBurn
    | InternalTransferStep
    | TopUpTons
    | AskToWithdrawExcess

type BounceOpToHandle = InternalTransferStep | BurnNotificationForMinter

const ERROR_UNSUFFICIENT_AMOUNT = 76
const ERROR_INVALID_EXCESSES_DESTINATION = 77

fun reserveModeExactFail() {
    return RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
}

fun requiredWalletReserve(backedAmount: coins) {
    return backedAmount + calculateJettonWalletMinStorageFee() + contract.getStorageDuePayment();
}

fun onBouncedMessage(in: InMessageBounced) {
    val msg = lazy BounceOpToHandle.fromSlice(in.bouncedBody.skipBouncedPrefix());
    val restoreAmount = match (msg) {
        InternalTransferStep => msg.jettonAmount,       // safe to fetch jettonAmount, because
        BurnNotificationForMinter => msg.jettonAmount,  // it's in the beginning of a message
    };

    var storage = lazy WalletStorage.load();
    storage.jettonBalance += restoreAmount;
    storage.save();
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToWallet.fromSlice(in.body);

    match (msg) {
        InternalTransferStep => {
            var storage = lazy WalletStorage.load();
            if (in.senderAddress != storage.minterAddress) {
                val calcAddress = calcAddressOfJettonWallet(msg.transferInitiator!, storage.minterAddress, contract.getCode());
                assert (in.senderAddress == calcAddress) throw ERROR_NOT_VALID_WALLET;
            }
            val jettonBalanceNext = storage.jettonBalance + msg.jettonAmount;
            val requiredReserve = requiredWalletReserve(jettonBalanceNext);
            // Hard reserve check: the inbound transfer must fund the full post-credit backing floor
            // before we credit wGRAM or allow any forward / excess action to run.
            assert (contract.getOriginalBalance() >= requiredReserve + msg.forwardTonAmount) throw ERROR_UNSUFFICIENT_AMOUNT;
            // Soft reserve check: keep GRAM that was already on the wallet before this message from
            // being reclassified as outbound excess. This surplus is best-effort under RESERVE_MODE_AT_MOST.
            // `requiredWalletReserve(x)` is linear in `x` within this transaction, so subtracting the
            // credited jetton amount gives the pre-credit reserve without recomputing the helper.
            val requiredReserveBeforeCredit = requiredReserve - msg.jettonAmount;
            val balanceBeforeMessage = contract.getOriginalBalance() - in.valueCoins;
            val preservedSurplus = balanceBeforeMessage > requiredReserveBeforeCredit
                ? balanceBeforeMessage - requiredReserveBeforeCredit
                : 0 as coins;
            reserveToncoinsOnBalance(
                requiredReserve + preservedSurplus,
                RESERVE_MODE_AT_MOST | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL
            );

            storage.jettonBalance = jettonBalanceNext;
            storage.save();

            if (msg.forwardTonAmount != 0) {
                val notifyOwnerMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.ownerAddress,
                    value: msg.forwardTonAmount,
                    body: TransferNotificationForRecipient {
                        queryId: msg.queryId,
                        jettonAmount: msg.jettonAmount,
                        transferInitiator: msg.transferInitiator,
                        forwardPayload: msg.forwardPayload,
                    }
                });
                notifyOwnerMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
            }

            if (msg.sendExcessesTo != null) {
                val excessesMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: msg.sendExcessesTo,
                    value: 0,
                    body: ReturnExcessesBack {
                        queryId: msg.queryId
                    }
                });
                excessesMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
            }
        }

        AskToTransfer => {
            msg.forwardPayload.checkIsCorrectTLBEither();
            assert (msg.transferRecipient.getWorkchain() == MY_WORKCHAIN) throw ERROR_WRONG_WORKCHAIN;

            checkAmountIsEnoughToTransfer(in.valueCoins, msg.forwardTonAmount, in.originalForwardFee);

            var storage = lazy WalletStorage.load();
            assert (in.senderAddress == storage.ownerAddress) throw ERROR_NOT_OWNER;
            assert (storage.jettonBalance >= msg.jettonAmount) throw ERROR_BALANCE_ERROR;
            storage.jettonBalance -= msg.jettonAmount;
            storage.save();

            // Preserve the remaining wGRAM backing plus storage reserve exactly, or abort the transfer.
            reserveToncoinsOnBalance(requiredWalletReserve(storage.jettonBalance), reserveModeExactFail());

            val deployMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: calcDeployedJettonWallet(msg.transferRecipient, storage.minterAddress, contract.getCode()),
                value: 0,
                body: InternalTransferStep {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    transferInitiator: storage.ownerAddress,
                    sendExcessesTo: msg.sendExcessesTo,
                    forwardTonAmount: msg.forwardTonAmount,
                    forwardPayload: msg.forwardPayload,
                }
            });
            deployMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        AskToBurn => {
            checkAmountIsEnoughToBurn(in.valueCoins);

            var storage = lazy WalletStorage.load();
            assert (in.senderAddress == storage.ownerAddress) throw ERROR_NOT_OWNER;
            assert (storage.jettonBalance >= msg.jettonAmount) throw ERROR_BALANCE_ERROR;
            // Burn must name a refund destination so the minter can return the withdrawn GRAM instead of trapping it
            assert (msg.sendExcessesTo != null) throw ERROR_INVALID_EXCESSES_DESTINATION;
            assert (msg.sendExcessesTo!.getWorkchain() == MY_WORKCHAIN) throw ERROR_WRONG_WORKCHAIN;
            storage.jettonBalance -= msg.jettonAmount;
            storage.save();

            // Preserve the remaining backing exactly before sending the withdrawn GRAM to the minter.
            reserveToncoinsOnBalance(requiredWalletReserve(storage.jettonBalance), reserveModeExactFail());

            val notifyMinterMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: storage.minterAddress,
                value: 0,
                body: BurnNotificationForMinter {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    burnInitiator: storage.ownerAddress,
                    sendExcessesTo: msg.sendExcessesTo,
                }
            });
            notifyMinterMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        TopUpTons => {
            // Accept TONs
        }

        AskToWithdrawExcess => {
            var storage = lazy WalletStorage.load();
            assert (in.senderAddress == storage.ownerAddress) throw ERROR_NOT_OWNER;
            assert (msg.sendExcessesTo.getWorkchain() == MY_WORKCHAIN) throw ERROR_WRONG_WORKCHAIN;
            // Preserve the strict GRAM backing for the current jetton balance; anything above
            // is owner-recoverable surplus (top-ups, bounced-transfer leftovers, mint overfunding).
            reserveToncoinsOnBalance(requiredWalletReserve(storage.jettonBalance), reserveModeExactFail());

            val excessMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.sendExcessesTo,
                value: 0,
                body: ReturnExcessesBack {
                    queryId: msg.queryId
                }
            });
            excessMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
        }

        else => throw 0xFFFF
    }
}



struct JettonWalletDataReply {
    jettonBalance: coins
    ownerAddress: address
    minterAddress: address
    jettonWalletCode: cell
}

// --- Getters ---

get fun typeAndVersion(): (slice, slice) {
    return ("link.chain.ton.wgram.JettonWallet".literalSlice(), "0.0.1".literalSlice());
}

get fun get_wallet_data(): JettonWalletDataReply {
    var storage = lazy WalletStorage.load();

    return {
        jettonBalance: storage.jettonBalance,
        ownerAddress: storage.ownerAddress,
        minterAddress: storage.minterAddress,
        jettonWalletCode: contract.getCode(),
    }
}

get fun get_status(): int {
    var storage = lazy WalletStorage.load();
    return storage.status;
}
