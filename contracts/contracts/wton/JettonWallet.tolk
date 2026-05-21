import "@stdlib/gas-payments"
import "../lib/jetton/errors"
import "../lib/jetton/jetton-utils"
import "../lib/jetton/fees-management"
import "../lib/jetton/storage"
import "../lib/jetton/messages"

contract JettonWallet {
    author: "Chainlink"
    incomingMessages: AllowedMessageToWallet
    storage: WalletStorage
}

type AllowedMessageToWallet =
    | AskToTransfer
    | AskToBurn
    | InternalTransferStep
    | TopUpTons

type BounceOpToHandle = InternalTransferStep | BurnNotificationForMinter

const ERROR_UNSUFFICIENT_AMOUNT = 76
const ERROR_INVALID_BURN_DESTINATION = 77
const ERROR_TOP_UP_TOO_LARGE = 78

fun reserveModeExactFail() {
    return RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
}

fun requiredWalletReserve(backedTonAmount: coins) {
    return backedTonAmount + calculateJettonWalletMinStorageFee() + contract.getStorageDuePayment();
}

fun walletTopUpCap() {
    return calculateJettonWalletMinStorageFee() + contract.getStorageDuePayment();
}

fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();

    val msg = lazy BounceOpToHandle.fromSlice(in.bouncedBody);
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
                assert (in.senderAddress == calcAddressOfJettonWallet(msg.transferInitiator!, storage.minterAddress, contract.getCode())) throw ERROR_NOT_VALID_WALLET;
            }
            val nextJettonBalance = storage.jettonBalance + msg.jettonAmount;
            val requiredReserve = requiredWalletReserve(nextJettonBalance);
            // AUDIT(WTON-1): require the incoming transfer to carry the full hosted TON backing before we credit wTON.
            assert (contract.getOriginalBalance() >= requiredReserve + msg.forwardTonAmount) throw ERROR_UNSUFFICIENT_AMOUNT;
            // AUDIT(WTON-2): lock backing + storage reserve before any notification/excess send can spend value.
            reserveToncoinsOnBalance(requiredReserve, reserveModeExactFail());

            storage.jettonBalance = nextJettonBalance;
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

            // AUDIT(WTON-3): preserve the remaining wTON backing plus storage reserve exactly, or abort the transfer.
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
            // AUDIT(WTON-4): burn must name a refund destination so the minter can return the withdrawn TON instead of trapping it.
            assert (msg.sendExcessesTo != null) throw ERROR_INVALID_BURN_DESTINATION;
            storage.jettonBalance -= msg.jettonAmount;
            storage.save();

            // AUDIT(WTON-5): preserve the remaining backing exactly before sending the withdrawn TON to the minter.
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
            // AUDIT(WTON-6): cap rent top-ups so arbitrary TON cannot be mixed into the hosted asset accounting.
            assert (in.valueCoins <= walletTopUpCap()) throw ERROR_TOP_UP_TOO_LARGE;
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
    return ("link.chain.ton.wton.JettonWallet", "0.0.1");
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
