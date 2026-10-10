// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/deployable/namespace"

/// Represents the amount of GRAM coins we reserve on the balance to pay for storage fees.
const DepositAccount_MIN_GRAM_TO_RESERVE: int = grams("0.05");
const DepositAccount_MIN_GRAM_TO_INIT: int = grams("0.01") // extra for gas fees // TODO  update with real value
/// Attached to the TEP-89 wallet query; the token's response returns the unspent part.
const DepositAccount_WALLET_QUERY_VALUE: int = grams("0.02") // TODO update with real value

/// Runtime data stored by each DepositAccount instance.
///
/// A deposit account escrows a single jetton for a single user: it lets a fixed set of
/// `beneficiaries` withdraw jettons and forwards inbound messages to the `proxy` (default) or hands
/// them to a hook a specialized account (e.g. OnRampAccount) wires.
struct DepositAccount_Data {
    /// Account that deploys and initializes the account. Only the owner may init.
    owner: address;
    /// Account that messages are forwarded to (e.g. TP, Router).
    proxy: address;
    /// Jetton master this account escrows; see `DepositAccount_DeploymentID`.
    token: address;
    /// Accounts that are allowed to withdraw jettons from this account's wallet (a set).
    beneficiaries: map<address, ()>;
    /// Jetton wallet of this account, learned from `token` when an init sets `learnWallet`.
    wallet: Cell<address>? = null;
    /// Init waiting for the wallet query; others arriving meanwhile are refused.
    pendingInit: Cell<DepositAccount_PendingInit>? = null;
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

/// Deployment ID of a per-user, per-token account (DepositAccount / OnRampAccount).
///
/// @dev The token is part of the derivation so an account can only ever hold one jetton. Were it
///      token-agnostic, a malicious minter or pool could hand out the jetton wallet of a
///      *different* jetton owned by the same account, making the Router withdraw the wrong
///      jettons or acknowledge a transfer that never happened.
struct DepositAccount_DeploymentID {
    user: address;
    token: address;
}

/// Computes the deterministic address of a per-user, per-token account deployed via the Deployable
/// pattern.
///
/// @dev The address depends only on (deployableCode, namespace, owner, user, token). The account's
///      config (proxy, beneficiaries) is NOT part of the address — it is installed atomically at
///      deployment (via `Deployable_Initialize`), and since a retried `Deployable_Initialize`
///      bounces off the already-upgraded account (unrecognized opcode), the first deployment's
///      config is the one that sticks: always derive and deploy with the same config.
fun calcAddressOfAccount(
    deployableCode: cell,
    namespace: Namespace,
    owner: address,
    user: address,
    token: address,
): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code: deployableCode,
            data: NamespacedDeployableData<DepositAccount_DeploymentID>({
                namespace,
                owner,
                id: DepositAccount_DeploymentID { user, token },
            }),
        },
    };
}

fun calcAddressOfDepositAccount(
    deployableCode: cell,
    owner: address,
    receiver: address,
    token: address,
): AutoDeployAddress {
    return calcAddressOfAccount(
        deployableCode,
        DeployableNamespace_DepositAccount,
        owner,
        receiver,
        token,
    );
}