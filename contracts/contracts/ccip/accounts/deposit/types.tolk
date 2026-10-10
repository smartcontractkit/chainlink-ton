// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/deployable/namespace"

/// Represents the amount of GRAM coins we reserve on the balance to pay for storage fees.
const DepositAccount_MIN_GRAM_TO_RESERVE: int = grams("0.05");
const DepositAccount_MIN_GRAM_TO_INIT: int = grams("0.01") // extra for gas fees // TODO  update with real value

/// Runtime data stored by each DepositAccount instance.
///
/// A deposit account is a single-token escrow hub: it lets a fixed set of `beneficiaries` withdraw
/// jettons and forwards inbound messages to the `proxy` (default) or hands them to a hook a
/// specialized account (e.g. OnRampAccount) wires. It does NOT track which jetton wallet it trusts —
/// wallet authorization is verified by the party that knows the token set (off-ramp: the pool;
/// on-ramp: the token-handling layer). The account is keyed by `token`: Router-owned OnRampAccounts
/// derive their address from (sender, token), so a user gets one account per token. Pool-owned
/// off-ramp accounts currently store `ZERO_ADDRESS` here (their address is keyed by receiver only).
/// TODO: Update when deposit account ownwrship gets moved to Router
struct DepositAccount_Data {
    /// Account that deploys and initializes the account. Only the owner may init.
    owner: address;
    /// Account that messages are forwarded to (e.g. TP, Router).
    proxy: address;
    /// Jetton minter this deposit account is associated with. Part of the stored config (not
    /// necessarily of the address): echoed in `DepositAccount_Reply` and carried in
    /// `DepositAccount_WithdrawFailed` so the owner can re-derive the reporting account.
    token: address;
    /// Accounts that are allowed to withdraw jettons from this account's wallet (a set).
    beneficiaries: map<address, ()>;
}

/// Facility ID used for error code derivation; (crc32(<facility>) % 640) + 10
const DepositAccount_FACILITY_NAME = "link.chain.ton.ccip.account.DepositAccount";
const DepositAccount_FACILITY_ID = DepositAccount_FACILITY_NAME.crc32() % 640 + 10;

/// Error codes for DepositAccount.
enum DepositAccount_Error {
    /// Thrown when a non-owner attempts to initialize the account via `DepositAccount_Init`.
    OnlyOwner = DepositAccount_FACILITY_ID * 100
    /// Thrown when a non-beneficiary attempts to withdraw jettons.
    OnlyBeneficiary
    /// Thrown when a withdraw's `AskToTransfer.sendExcessesTo` is not set to the requester (the
    /// sender of the `DepositAccount_Withdraw`). Required so a bounced withdraw can be correlated
    /// back to and notify the requester.
    OnlySendExcessesToSender
}

/// Computes the deterministic address of a pool-owned DepositAccount deployed via the Deployable
/// pattern (off-ramp role: the pool deploys the account and verifies its replies).
///
/// @dev Token-agnostic: the address depends only on (deployableCode, namespace, owner (tokenPool), id (receiver)), so
///      a user has one off-ramp account across all tokens; the wallet boundary is enforced at the
///      pool/authorizer. This is independent of the Router-owned OnRampAccount derivation
///      (`_onRampAccountAddress` in `ccip/router/utils.tolk`), which keys the Deployable ID by
///      (sender, token). The account's config (beneficiaries) is NOT part of the address
///      — it is installed atomically at deployment (via `Deployable_Initialize`), and since a
///      retried `Deployable_Initialize` bounces off the already-upgraded account (unrecognized
///      opcode), the first deployment's config is the one that sticks: always derive and deploy
///      with the same config.
/// TODO: Update when deposit account ownership gets moved to Router
fun calcAddressOfDepositAccount(
    deployableCode: cell,
    owner: address,
    receiver: address,
): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code: deployableCode,
            data: NamespacedDeployableData<address>({
                namespace: DeployableNamespace_DepositAccount,
                owner,
                id: receiver,
            }),
        },
    };
}