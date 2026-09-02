// SPDX-License-Identifier: BUSL-1.1

/// Represents the amount of GRAM coins we reserve on the balance to pay for storage fees.
const MIN_GRAM_TO_RESERVE: int = grams("0.05");

/// Runtime data stored by each DepositAccount instance.
///
/// A deposit account is a token-agnostic escrow hub: it lets a fixed set of `beneficiaries` withdraw
/// jettons and forwards inbound messages to the `proxy` (default) or hands them to a hook a
/// specialized account (e.g. OnRampAccount) wires. It does NOT track which jetton wallet it trusts —
/// wallet authorization is verified by the party that knows the token set (off-ramp: the pool;
/// on-ramp: the token-handling layer), so one account per user serves any number of tokens.
struct DepositAccount_Data {
    /// Account that deploys and initializes the account. Only the owner may init.
    owner: address;
    /// Account that messages are forwarded to (e.g. TP, Router).
    proxy: address;
    /// Accounts that are allowed to withdraw jettons from this account's wallet (a set).
    beneficiaries: map<address, ()>;
}

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const DepositAccount_FACILITY_NAME = "link.chain.ton.ccip.account.DepositAccount";
const DepositAccount_FACILITY_ID = DepositAccount_FACILITY_NAME.crc32() % 640 + 10;

/// Error codes for DepositAccount.
enum DepositAccount_Error {
    /// Thrown when a non-owner attempts to initialize the account.
    OnlyOwner = DepositAccount_FACILITY_ID * 100
    /// Thrown when a non-beneficiary attempts to withdraw jettons.
    OnlyBeneficiary
    /// Thrown when a withdraw's `AskToTransfer.sendExcessesTo` is not set to the requester (the
    /// sender of the `DepositAccount_Withdraw`). Required so a bounced withdraw can be correlated
    /// back to and notify the requester.
    OnlySendExcessesToSender
}

/// Computes the deterministic address of a DepositAccount given its config.
/// @dev Token-agnostic: the address depends only on (code, owner, proxy, beneficiaries), so a user
///      has one account across all tokens; the wallet boundary is enforced at the pool/authorizer.
fun calcAddressOfDepositAccount(
    code: cell,
    owner: address,
    proxy: address,
    beneficiaries: map<address, ()>,
): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code,
            data: DepositAccount_Data {
                owner,
                proxy,
                beneficiaries,
            }.toCell(),
        },
    };
}
