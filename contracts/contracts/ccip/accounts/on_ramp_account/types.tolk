// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/jetton_client"

const OnRampAccount_CONTRACT_NAME = "link.chain.ton.ccip.OnRampAccount".literalSlice();
const OnRampAccount_CONTRACT_VERSION = "0.1.0".literalSlice();

/// Minimal deployment + activation value for the OnRampAccount.
const OnRampAccount_DEPLOY_VALUE = ton("0.1");

/// Runtime data stored by each OnRampAccount instance.
///
/// A per-user deposit account on the source chain. A user can send jettons to this
/// account together with (optionally) a `Router_CCIPSend` message in the jetton
/// transfer's forward payload. The owner can always withdraw their own jettons;
/// the beneficiary (the Router) can also withdraw them, which is how a CCIP send
/// actually moves tokens out of the account into a token pool.
///
/// Auth note: this account never moves tokens on its own. Every outgoing transfer is
/// an `AskToTransfer` to this account's own jetton wallet, and only `owner` or
/// `beneficiary` may request it. This mirrors `OffRampAccount`, but with a
/// beneficiary (Router) rather than a pool as the second authorized party.
struct OnRampAccount_Data {
    /// The user who deposited jettons. Can withdraw at any time.
    owner: address;
    /// The Router contract. Can withdraw at any time (issued via the CCIP send /
    /// token-pool withdraw flow), and receives forwarded CCIPSend messages.
    beneficiary: address;
    /// Jetton identity (master + wallet code). Set on init so the account can derive its
    /// own wallet (to authenticate deposits) and the beneficiary's wallet (to forward).
    /// Excluded from deterministic address derivation (see `calcAddressOfOnRampAccount`).
    /// `null` until initialized.
    jettonClient: Cell<JettonClient>? = null;
}

/// Error codes for OnRampAccount.
enum OnRampAccount_Error {
    /// Thrown when a non-owner/non-beneficiary attempts to withdraw or forward jettons.
    OnlyOwnerOrBeneficiary = 0x1002,
    /// Thrown when a deposit notification is not from this account's own jetton wallet.
    OnlyOwnWallet = 0x1004,
    /// Thrown when the account is not yet initialized (missing jetton identity).
    NotInitialized = 0x1005,
    /// Thrown when onInit is called on an already-initialized account.
    AlreadyInit = 0x1006,
}

/// Computes the deterministic address of an OnRampAccount given its config.
/// @dev Physically the account is deployed via the Deployables + namespace pattern (Router owns
///      the deployable, namespace = OnRampAccount, id = user), but the OnRampAccount itself only
///      knows how to compute its own address from its runtime data — the same style as
///      `OffRampAccount`. The token pool (which knows the Deployables setup) is responsible for
///      deriving the account via Deployables to authenticate deposits. See
///      `TokenPool_DynamicConfig.allowedDepositNamespaces` / `TokenPool_AdminConfig.deployableCode`.
fun calcAddressOfOnRampAccount(
    code: cell,
    owner: address,
    beneficiary: address,
): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code,
            data: OnRampAccount_Data {
                owner,
                beneficiary,
                jettonClient: null,
            }.toCell(),
        },
    };
}
