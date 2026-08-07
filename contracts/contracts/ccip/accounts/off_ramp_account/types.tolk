// SPDX-License-Identifier: BUSL-1.1

const OffRampAccount_CONTRACT_NAME = "link.chain.ton.ccip.OffRampAccount".literalSlice();
const OffRampAccount_CONTRACT_VERSION = "0.1.0".literalSlice();

/// @notice Minimal deployment + activation value for the OffRampAccount.
const OffRampAccount_DEPLOY_VALUE = ton("0.1");

/// @notice Runtime data stored by each OffRampAccount instance.
/// A dumb forwarder: receives jetton notifications, forwards them to the pool with full message metadata.
/// Owner = recipient (can withdraw jettons). NotificationTarget = pool.
/// Only forwards messages from the allowed jetton wallet (safety filter, like CE's forwardFrom).
/// @dev allowedJettonWallet is set on init (not part of address derivation).
struct OffRampAccount_Data {
    /// Recipient who can withdraw jettons from this account.
    owner: address;
    /// Pool contract that receives forwarded notifications.
    notificationTarget: address;
    /// Only messages from this jetton wallet are forwarded (prevents spam from other jettons).
    /// Set on init — OAA address is derived from (code, owner, notificationTarget) only.
    allowedJettonWallet: address?;
}

/// @notice Error codes for OffRampAccount.
enum OffRampAccount_Error {
    /// Thrown when the pool tries to init but sender is not the notification target.
    OnlyPool = 0x1001,
    /// Thrown when a non-owner attempts to withdraw jettons.
    OnlyOwner = 0x1003,
}

/// @notice Computes the deterministic address of an OffRampAccount given its config.
/// @dev allowedJettonWallet is NOT part of address derivation — it's set on init.
fun calcAddressOfOffRampAccount(
    code: cell,
    owner: address,
    notificationTarget: address,
): AutoDeployAddress {
    return AutoDeployAddress {
        stateInit: ContractState {
            code,
            data: OffRampAccount_Data {
                owner,
                notificationTarget,
                allowedJettonWallet: null,
            }.toCell(),
        },
    };
}
