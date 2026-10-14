// SPDX-License-Identifier: BUSL-1.1

/// Kept on the balance to pay for storage fees.
const DepositAccount_MIN_GRAM_TO_RESERVE: int = grams("0.05");
const DepositAccount_MIN_GRAM_TO_INIT: int = grams("0.01") // TODO update with real value
/// Attached to the TEP-89 wallet query; the token's response returns the unspent part.
const DepositAccount_WALLET_QUERY_VALUE: int = grams("0.02") // TODO update with real value
/// Inits that can wait for the wallet query at once; further ones bounce with `PendingInitsFull`.
const DepositAccount_MAX_PENDING_INITS: int = 8

/// A deposit account escrows a single jetton (`token`) for a single `user`. A fixed set of
/// `beneficiaries` may withdraw it, and incoming jetton transfer notifications are forwarded to
/// `user`, or to the `DepositAccount_Notify` target carried in the transfer.
///
/// @dev Deployed through Deployables: the deployer must install the `owner`, `user` and `token` it
///      derived the address from.
struct DepositAccount_Data {
    /// Deployer of the account. Only the owner may init.
    owner: address;
    user: address;
    /// Jetton master of the escrowed jetton.
    token: address;
    /// Addresses allowed to withdraw from the account's jetton wallet.
    beneficiaries: map<address, ()>;
    /// Jetton wallet of the account, learned from `token` on the first init.
    wallet: Cell<address>? = null;
    /// Inits waiting for the wallet query, keyed by arrival order.
    pendingInits: map<uint8, DepositAccount_PendingInit> = [];
}

struct DepositAccount_PendingInit {
    queryId: uint64;
    forwardPayload: cell?;
    /// Init value returned with the reply.
    value: coins;
}

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const DepositAccount_FACILITY_NAME = "link.chain.ton.ccip.account.DepositAccount";
const DepositAccount_FACILITY_ID = DepositAccount_FACILITY_NAME.crc32() % 640 + 10;

enum DepositAccount_Error {
    /// Thrown when a non-owner sends `DepositAccount_Init`.
    OnlyOwner = DepositAccount_FACILITY_ID * 100
    /// Thrown when a non-beneficiary sends `DepositAccount_Withdraw`.
    OnlyBeneficiary
    /// Thrown when a withdraw's `AskToTransfer.sendExcessesTo` is not the requester, which a
    /// bounced withdraw is reported back to.
    OnlySendExcessesToSender
    /// Thrown when an init arrives while `DepositAccount_MAX_PENDING_INITS` inits already wait for
    /// the wallet query.
    PendingInitsFull
    /// Thrown when a `ResponseWalletAddress` does not come from the account's token.
    OnlyToken
    /// Thrown when a `ResponseWalletAddress` arrives with no init waiting for it.
    NoPendingInit
    /// Thrown when the init value or the account balance can't cover the init cost and rent reserve.
    NotEnoughValue
    /// Thrown when a withdraw arrives before the account learned its jetton wallet.
    WalletUnknown
}
