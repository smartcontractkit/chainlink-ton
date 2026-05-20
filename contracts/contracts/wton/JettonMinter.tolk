import "@stdlib/strings"
import "../lib/jetton/errors"
import "../lib/jetton/jetton-utils"
import "../lib/jetton/fees-management"
import "../lib/jetton/storage"
import "../lib/jetton/messages"

contract JettonMinter {
    author: "Chainlink"
    incomingMessages: AllowedMessageToMinter
    storage: MinterStorage
}

type AllowedMessageToMinter =
    | MintNewJettons
    | BurnNotificationForMinter
    | RequestWalletAddress
    | ChangeMinterMetadataUri
    | UpgradeMinterCode
    | TopUpTons

const ERROR_ALREADY_INITIALIZED = 75

fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();
    // process only mint bounces; on other messages, an exception will be thrown, it's okay
    val msg = lazy InternalTransferStep.fromSlice(in.bouncedBody);

    var storage = lazy MinterStorage.load();
    storage.totalSupply -= msg.jettonAmount;
    storage.save();
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToMinter.fromSlice(in.body);

    match (msg) {
        BurnNotificationForMinter => {
            var storage = lazy MinterStorage.load();
            assert (in.senderAddress == calcAddressOfJettonWallet(msg.burnInitiator, contract.getAddress(), storage.jettonWalletCode)) throw ERROR_NOT_VALID_WALLET;
            storage.totalSupply -= msg.jettonAmount;
            storage.save();

            if (msg.sendExcessesTo == null) {
                return;
            }

            val excessesMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.sendExcessesTo,
                value: 0,
                body: ReturnExcessesBack {
                    queryId: msg.queryId
                }
            });
            excessesMsg.send(SEND_MODE_IGNORE_ERRORS | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
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
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            assert (msg.mintRecipient.getWorkchain() == MY_WORKCHAIN) throw ERROR_WRONG_WORKCHAIN;

            val internalTransferMsg = lazy msg.internalTransferMsg.load({
                throwIfOpcodeDoesNotMatch: ERROR_INVALID_OP
            });
            var forwardTonAmount = internalTransferMsg.forwardTonAmount;
            internalTransferMsg.forwardPayload.checkIsCorrectTLBEither();

            // a little more than needed, it’s ok since it’s sent by the admin and excesses will return back
            checkAmountIsEnoughToTransfer(msg.tonAmount, forwardTonAmount, in.originalForwardFee);

            storage.totalSupply += internalTransferMsg.jettonAmount;
            storage.save();

            reserveToncoinsOnBalance(ton("0.01"), RESERVE_MODE_EXACT_AMOUNT); // reserve for storage fees

            val deployMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: calcDeployedJettonWallet(msg.mintRecipient, contract.getAddress(), storage.jettonWalletCode),
                value: msg.tonAmount,
                body: msg.internalTransferMsg,
            });
            deployMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
        }

        ChangeMinterMetadataUri => {
            var storage = lazy MinterStorage.load();
            assert (storage.newMetadataUri != null) throw ERROR_ALREADY_INITIALIZED;
            // convert "inlined snake string" to a normal (ref) string, bypassing the type system
            storage.metadataUri = msg.newMetadataUri.toCell() as unknown as string;
            storage.save();
        }

        TopUpTons => {
            // just accept tons
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
    return ("link.chain.ton.wton.JettonMinter", "0.0.1");
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
        adminAddress: null, // wTON has no admin
        jettonContent: metadata.toCell(),
        jettonWalletCode: storage.jettonWalletCode,
    }
}

get fun get_wallet_address(ownerAddress: address): address {
    val storage = lazy MinterStorage.load();
    return calcAddressOfJettonWallet(ownerAddress, contract.getAddress(), storage.jettonWalletCode);
}
