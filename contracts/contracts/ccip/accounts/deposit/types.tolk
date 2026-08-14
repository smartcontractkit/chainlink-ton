// SPDX-License-Identifier: BUSL-1.1

const DepositAccount_CONTRACT_NAME = "link.chain.ton.ccip.DepositAccount".literalSlice();
const DepositAccount_CONTRACT_VERSION = "0.1.0".literalSlice();

/// Represents the amount of GRAM coins we reserve on the balance to pay for storage fees.
const MIN_GRAM_TO_RESERVE: int = ton("0.05");

/// Runtime data stored by each DepositAccount instance.
///
/// A deposit account holds jettons received into its own (derived) jetton wallet and lets a
/// fixed set of `beneficiaries` withdraw them. Any message arriving from the account's allowed
/// jetton wallet is either forwarded to the `proxy` (default) or handed to a hook that a
/// specialized account (e.g. OnRampAccount) may override.
///
/// @dev allowedJettonWallet is set on init (not part of address derivation).
struct DepositAccount_Data {
    /// Account that deploys and initializes the account.
    owner: address;
    /// Account that messages are forwarded to (e.g. TP, Router).
    proxy: address;
    /// Accounts that are allowed to withdraw jettons from this account's wallet.
    beneficiaries: map<address, bool>;
    /// Only messages from this jetton wallet are forwarded (prevents spam from other jettons).
    /// Set on init — DepositAccount address is derived from (code, owner, proxy, beneficiaries) only.
    allowedJettonWallet: address?;
}

/// Facility ID used for error code derivation.
const DepositAccount_FACILITY_NAME = "link.chain.ton.ccip.DepositAccount";
// TODO: double check this ID val
const DepositAccount_FACILITY_ID = 80;  // (crc32(<facility>) % 640) + 10

/// Error codes for DepositAccount.
enum DepositAccount_Error {
    /// Thrown when a non-owner/non-proxy attempts to initialize the account.
    OnlyOwnerOrProxy = DepositAccount_FACILITY_ID * 100
    /// Thrown when a non-beneficiary attempts to withdraw jettons.
    OnlyBeneficiary
    /// Thrown when a withdraw's `AskToTransfer.sendExcessesTo` is not set to the requester (the
    /// sender of the `DepositAccount_Withdraw`). Required so a bounced withdraw can be correlated
    /// back to and notify the requester.
    WithdrawExcessToRequester
}

/// Computes the deterministic address of a DepositAccount given its config.
/// @dev allowedJettonWallet is NOT part of address derivation — it's set on init.
fun calcAddressOfDepositAccount(
    code: cell,
    owner: address,
    proxy: address,
    beneficiaries: map<address, bool>,
): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code,
            data: DepositAccount_Data {
                owner,
                proxy,
                beneficiaries,
                allowedJettonWallet: null,
            }.toCell(),
        },
    };
}
