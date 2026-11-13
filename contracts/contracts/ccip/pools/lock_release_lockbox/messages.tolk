// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "../../../lib/versioning/upgradeable"

import "../lib/token_pool/messages"
import "../lockbox/messages"

type LockReleaseLockboxTokenPool_InMessage =
    | ReturnExcessesBack
    | JettonLockBox_Deposited
    | JettonLockBox_DepositFailed
    | JettonLockBox_WithdrawFailed
    | Upgradeable_Upgrade;

type LockReleaseLockboxTokenPool_OutMessage =
    | AskToTransfer;

type LockReleaseLockboxTokenPool_BouncedMessage =
    | AskToTransfer
    | JettonLockBox_Withdraw;
