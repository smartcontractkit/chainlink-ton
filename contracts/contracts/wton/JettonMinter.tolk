// SPDX-License-Identifier: MIT
tolk 1.4.1

import "@stdlib/strings"
import "@stdlib/gas-payments"
import "../lib/jetton/errors"
import "../lib/jetton/jetton-utils"
import "../lib/jetton/storage"
import "../lib/jetton/messages"
import "fees-management"

contract JettonMinter {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.0.1"
    description: "link.chain.ton.wton.JettonMinter"

    storage: MinterStorage
    incomingMessages: AllowedMessageToMinter
}

type AllowedMessageToMinter =
    | MintNewJettons
    | BurnNotificationForMinter
    | RequestWalletAddress
    | TopUpTons

const ERROR_UNSUFFICIENT_AMOUNT = 76
const ERROR_INVALID_EXCESSES_DESTINATION = 77
const ERROR_INVALID_RECIPIENT = 78

fun reserveModeExactFail() {
    return RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
}

fun requiredMinterReserve() {
    return ton("0.01") + contract.getStorageDuePayment();
}

/// Refund the mint on bounce, reuses sendExcessesTo as the bounce refund destination,
/// so a failed wallet deploy/credit returns TON.
fun refundMintBounce(msg: InternalTransferStep) {
    // We're already in the mint recovery path after supply rollback, so keep the minter reserve
    // if possible but never fail the bounce handler itself.
    reserveToncoinsOnBalance(requiredMinterReserve(), RESERVE_MODE_AT_MOST);

    val refundMsg = createMessage({
        // The mint-bounce refund is a forced TON deposit to the caller-chosen refund address.
        bounce: BounceMode.NoBounce,
        dest: msg.sendExcessesTo!, // safe to unwrap as it is required and validated in the minting path
        value: 0,
        body: ReturnExcessesBack {
            queryId: msg.queryId
        }
    });
    // IGNORE_ERRORS is used in the mint-bounce refund path because we are already in
    // onBouncedMessage after rolling supply back, so we make a forced deposit
    refundMsg.send(SEND_MODE_IGNORE_ERRORS | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onBouncedMessage(in: InMessageBounced) {
    // We require sendExcessesTo for refundMintBounce from the original mint payload, so the
    // bounced body must preserve the original root cell rather than the old 256-bit truncation.
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    val msg = lazy InternalTransferStep.fromCell(rich.originalBody);

    var storage = lazy MinterStorage.load();
    storage.totalSupply -= msg.jettonAmount;
    storage.save();

    refundMintBounce(msg);
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToMinter.fromSlice(in.body);

    match (msg) {
        BurnNotificationForMinter => {
            var storage = lazy MinterStorage.load();
            val calcAddress = calcAddressOfJettonWallet(msg.burnInitiator, contract.getAddress(), storage.jettonWalletCode);
            assert (in.senderAddress == calcAddress) throw ERROR_NOT_VALID_WALLET;
            // Reject burns without a refund destination so the withdrawn TON never gets stranded here.
            assert (msg.sendExcessesTo != null) throw ERROR_INVALID_EXCESSES_DESTINATION;
            assert (msg.sendExcessesTo!.getWorkchain() == MY_WORKCHAIN) throw ERROR_WRONG_WORKCHAIN;
            storage.totalSupply -= msg.jettonAmount;
            storage.save();

            // Keep only the minter rent reserve before withdrawing TON.
            reserveToncoinsOnBalance(requiredMinterReserve(), reserveModeExactFail());

            val excessesMsg = createMessage({
                // Burn payout sends native TON to the recipient as a non-bounceable withdrawal (forced deposit).
                bounce: BounceMode.NoBounce,
                dest: msg.sendExcessesTo!,
                value: 0,
                body: ReturnExcessesBack {
                    queryId: msg.queryId
                }
            });
            // If the send action cannot be executed, the tx must fail and bounce back to the wallet to restore wTON.
            excessesMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        RequestWalletAddress => {
            var ownerAddress: Cell<address>? = msg.includeOwnerAddress
                ? msg.ownerAddress.toCell()
                : null;

            var walletAddress: address? = null;
            if (msg.ownerAddress.getWorkchain() == MY_WORKCHAIN) {
                val storage = lazy MinterStorage.load();
                walletAddress = calcAddressOfJettonWallet(msg.ownerAddress, contract.getAddress(), storage.jettonWalletCode);
            }

            val respondMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ResponseWalletAddress {
                    queryId: msg.queryId,
                    jettonWalletAddress: walletAddress,
                    ownerAddress: ownerAddress,
                }
            });
            respondMsg.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        MintNewJettons => {
            var storage = lazy MinterStorage.load();
            assert (msg.mintRecipient.getWorkchain() == MY_WORKCHAIN) throw ERROR_WRONG_WORKCHAIN;
            assert (msg.mintRecipient != contract.getAddress()) throw ERROR_INVALID_RECIPIENT;

            val internalTransferMsg = lazy msg.internalTransferMsg.load({
                throwIfOpcodeDoesNotMatch: ERROR_INVALID_OP
            });
            var forwardTonAmount = internalTransferMsg.forwardTonAmount;
            internalTransferMsg.forwardPayload.checkIsCorrectTLBEither();

            val jettonAmount = internalTransferMsg.jettonAmount;
            // Mint must name the same excess/refund destination for both the happy path and a bounced wallet deployment.
            assert (internalTransferMsg.sendExcessesTo != null) throw ERROR_INVALID_EXCESSES_DESTINATION;
            assert (internalTransferMsg.sendExcessesTo!.getWorkchain() == MY_WORKCHAIN) throw ERROR_WRONG_WORKCHAIN;
            assert (internalTransferMsg.sendExcessesTo! != contract.getAddress()) throw ERROR_INVALID_RECIPIENT;
            // Minting must not impersonate a peer wallet transfer initiator.
            assert (internalTransferMsg.transferInitiator == null) throw ERROR_INVALID_OP;
            // The caller must fund the hosted TON backing, the extra transfer budget, and the
            // minter's own outbound deploy/forward fee rather than borrowing it from minter surplus.
            checkAmountIsEnoughToMint(in.valueCoins, jettonAmount, msg.tonAmount, in.originalForwardFee);

            // The extra mint budget must independently cover the receiver-side transfer/forward flow.
            checkAmountIsEnoughToTransfer(msg.tonAmount, forwardTonAmount, in.originalForwardFee);
            // Keep the minter rent reserve intact so minting cannot drain operational TON.
            val requiredReserve = requiredMinterReserve();
            assert (contract.getOriginalBalance() >= requiredReserve + jettonAmount + msg.tonAmount) throw ERROR_UNSUFFICIENT_AMOUNT;

            storage.totalSupply += jettonAmount;
            storage.save();

            reserveToncoinsOnBalance(requiredReserve, reserveModeExactFail());

            val deployMsg = createMessage({
                // The mint-bounce refund flow need the original InternalTransferStep root cell, not
                // a truncated 256-bit prefix, otherwise sendExcessesTo/query data become unavailable on bounce.
                bounce: BounceMode.RichBounceOnlyRootCell,
                dest: calcDeployedJettonWallet(msg.mintRecipient, contract.getAddress(), storage.jettonWalletCode),
                value: jettonAmount + msg.tonAmount,
                body: msg.internalTransferMsg,
            });
            deployMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        TopUpTons => {
            // Accept TONs
        }

        else => throw 0xFFFF
    }
}



struct JettonDataReply {
    totalSupply: int
    mintable: bool
    adminAddress: address?  // left for compatibility with the standard (admin == null)
    jettonContent: Cell<OnchainMetadataReply>
    jettonWalletCode: cell
}

struct (0x00) OnchainMetadataReply {
    contentDict: map<uint256, string_prefixed0x>
}

// --- Getters ---

get fun typeAndVersion(): (slice, slice) {
    return ("link.chain.ton.wton.JettonMinter".literalSlice(), "0.0.1".literalSlice());
}

get fun get_jetton_data(): JettonDataReply {
    val storage = lazy MinterStorage.load();
    var metadata: OnchainMetadataReply = {
        contentDict: []
    };
    metadata.contentDict.set("uri".sha256(), storage.metadataUri.prefixWith00());
    metadata.contentDict.set("decimals".sha256(), "9".prefixWith00());

    return {
        totalSupply: storage.totalSupply,
        mintable: true,
        adminAddress: storage.adminAddress,
        jettonContent: metadata.toCell(),
        jettonWalletCode: storage.jettonWalletCode,
    }
}

get fun get_wallet_address(ownerAddress: address): address {
    val storage = lazy MinterStorage.load();
    return calcAddressOfJettonWallet(ownerAddress, contract.getAddress(), storage.jettonWalletCode);
}
