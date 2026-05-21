tolk 1.2

// TODO: update to 1.4
// import "@stdlib/strings"
import "../lib/jetton/errors"
import "../lib/jetton/jetton-utils"
import "../lib/jetton/storage"
import "../lib/jetton/messages"
import "fees-management"

// TODO: update to 1.4
// contract JettonMinter {
//     author: "Chainlink Labs"
//     incomingMessages: AllowedMessageToMinter
//     storage: MinterStorage
// }

type AllowedMessageToMinter =
    | MintNewJettons
    | BurnNotificationForMinter
    | RequestWalletAddress
    | ChangeMinterMetadataUri
    | TopUpTons

const ERROR_ALREADY_INITIALIZED = 75
const ERROR_UNSUFFICIENT_AMOUNT = 76
const ERROR_INVALID_EXCESSES_DESTINATION = 77
const ERROR_TOP_UP_TOO_LARGE = 78

fun reserveModeExactFail() {
    return RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL;
}

fun requiredMinterReserve() {
    return ton("0.01") + contract.getStorageDuePayment();
}

fun minterTopUpCap() {
    return requiredMinterReserve();
}

fun refundMintBounce(msg: InternalTransferStep) {
    // AUDIT(WTON-7): mint reuses sendExcessesTo as the bounce refund destination, so a failed wallet deploy/credit returns TON.
    reserveToncoinsOnBalance(requiredMinterReserve(), reserveModeExactFail());

    val refundMsg = createMessage({
        // AUDIT(WTON-17): mint-bounce refund is a forced TON deposit to the caller-chosen refund address.
        // If the destination throws, NoBounce keeps the TON there instead of looping another bounce.
        bounce: BounceMode.NoBounce,
        dest: msg.sendExcessesTo!,
        value: 0,
        body: ReturnExcessesBack {
            queryId: msg.queryId
        }
    });
    // AUDIT(WTON-18): IGNORE_ERRORS is kept only on the mint-bounce refund path because we are already in
    // onBouncedMessage after rolling supply back. If the send action itself fails here, reverting this tx would
    // resurrect supply without restoring the recipient wallet. The security-grade long-term fix is a pending-refund
    // ledger/claim flow; until then this path is intentionally best-effort and never a final accounting transition.
    refundMsg.send(SEND_MODE_IGNORE_ERRORS | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

fun onBouncedMessage(in: InMessageBounced) {
    // AUDIT(WTON-21): refundMintBounce needs sendExcessesTo from the original mint payload, so the
    // bounced body must preserve the full root cell rather than the old 256-bit truncation.
    val rich = lazy RichBounceBody.fromSlice(in.bouncedBody);
    var originalBody = rich.originalBody.beginParse();
    if (originalBody.preloadUint(32) != InternalTransferStep.getDeclaredPackPrefix()) {
        return;
    }
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
            assert (in.senderAddress == calcAddressOfJettonWallet(msg.burnInitiator, contract.getAddress(), storage.jettonWalletCode)) throw ERROR_NOT_VALID_WALLET;
            // reject burns without a refund destination so the withdrawn TON never gets stranded here
            assert (msg.sendExcessesTo != null) throw ERROR_INVALID_EXCESSES_DESTINATION;
            storage.totalSupply -= msg.jettonAmount;
            storage.save();

            // keep only the minter rent reserve before withdrawing TON
            reserveToncoinsOnBalance(requiredMinterReserve(), reserveModeExactFail());

            val excessesMsg = createMessage({
                // AUDIT(WTON-19): burn payout sends native TON to the recipient as a non-bounceable withdrawal.
                // If the recipient contract throws, NoBounce makes the TON stay there; the critical property is that
                // sender-side action failures MUST NOT be ignored, so the burn rolls back through the wallet bounce path.
                bounce: BounceMode.NoBounce,
                dest: msg.sendExcessesTo!,
                value: 0,
                body: ReturnExcessesBack {
                    queryId: msg.queryId
                }
            });
            // AUDIT(WTON-20): burn withdrawal is not "best effort". If this send action cannot be executed,
            // the minter tx must fail so BurnNotificationForMinter bounces back to the wallet and restores wTON.
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

            val internalTransferMsg = lazy msg.internalTransferMsg.load({
                throwIfOpcodeDoesNotMatch: ERROR_INVALID_OP
            });
            var forwardTonAmount = internalTransferMsg.forwardTonAmount;
            internalTransferMsg.forwardPayload.checkIsCorrectTLBEither();

            val jettonAmount = internalTransferMsg.jettonAmount;
            // AUDIT(WTON-10): mint must name the same excess/refund destination for both the happy path and a bounced wallet deployment.
            assert (internalTransferMsg.sendExcessesTo != null) throw ERROR_INVALID_EXCESSES_DESTINATION;
            // AUDIT(WTON-11): minting must not impersonate a peer wallet transfer initiator.
            assert (internalTransferMsg.transferInitiator == null) throw ERROR_INVALID_OP;
            // AUDIT(WTON-12): the caller must fund both the new hosted TON backing and the extra transfer budget.
            assert (in.valueCoins >= jettonAmount + msg.tonAmount) throw ERROR_UNSUFFICIENT_AMOUNT;

            // AUDIT(WTON-13): the extra mint budget must independently cover the receiver-side transfer/forward flow.
            checkAmountIsEnoughToTransfer(msg.tonAmount, forwardTonAmount, in.originalForwardFee);
            // AUDIT(WTON-14): keep the minter rent reserve intact so minting cannot drain operational TON.
            val requiredReserve = requiredMinterReserve();
            assert (contract.getOriginalBalance() >= requiredReserve + jettonAmount + msg.tonAmount) throw ERROR_UNSUFFICIENT_AMOUNT;

            storage.totalSupply += jettonAmount;
            storage.save();

            reserveToncoinsOnBalance(requiredReserve, reserveModeExactFail());

            val deployMsg = createMessage({
                // AUDIT(WTON-22): mint-bounce refunds need the original InternalTransferStep root cell, not
                // a truncated 256-bit prefix, otherwise sendExcessesTo/query data become unavailable on bounce.
                bounce: BounceMode.RichBounceOnlyRootCell,
                dest: calcDeployedJettonWallet(msg.mintRecipient, contract.getAddress(), storage.jettonWalletCode),
                value: jettonAmount + msg.tonAmount,
                body: msg.internalTransferMsg,
            });
            deployMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        ChangeMinterMetadataUri => {
            // wTON has no admin path, so metadata is immutable and this opcode throws
            throw ERROR_ALREADY_INITIALIZED;
        }

        TopUpTons => {
            // AUDIT(WTON-15): cap rent top-ups so arbitrary TON cannot silently accumulate outside mint/burn accounting.
            assert (in.valueCoins <= minterTopUpCap()) throw ERROR_TOP_UP_TOO_LARGE;
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

// TODO: update to 1.4
struct (0x00) OnchainMetadataReply {
    contentDict: map<uint256, Cell<SnakeDataReply>>
}

struct (0x00) SnakeDataReply {
    string: SnakeString
}

// --- Getters ---

get fun typeAndVersion(): (slice, slice) {
    return ("link.chain.ton.wton.JettonMinter", "0.0.1");
}

// TODO: update to 1.4
get fun get_jetton_data(): JettonDataReply {
    val storage = lazy MinterStorage.load();
    var metadata: OnchainMetadataReply = {
        contentDict: createEmptyMap()
    };
    metadata.contentDict.set(stringSha256("uri"), SnakeDataReply{string: storage.metadataUri.load()}.toCell());
    metadata.contentDict.set(stringSha256("decimals"), SnakeDataReply{string: "9"}.toCell());

    return {
        totalSupply: storage.totalSupply,
        mintable: true,
        adminAddress: null, // wTON has no admin
        jettonContent: metadata.toCell(),
        jettonWalletCode: storage.jettonWalletCode,
    }
}

get fun get_wallet_address(ownerAddress: address): address {
    val storage = lazy MinterStorage.load();
    return calcAddressOfJettonWallet(ownerAddress, contract.getAddress(), storage.jettonWalletCode);
}
