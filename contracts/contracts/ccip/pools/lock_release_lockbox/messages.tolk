// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "../../../lib/versioning/upgradeable"

import "../lockbox/messages"

type LockReleaseLockboxTokenPool_InMessage =
    | ReturnExcessesBack
    | JettonLockBox_Deposited
    | JettonLockBox_DepositFailed
    | JettonLockBox_WithdrawFailed
    | JettonLockBox_Info
    | Upgradeable_Upgrade;

type LockReleaseLockboxTokenPool_OutMessage =
    | AskToTransfer
    | JettonLockBox_GetInfo;

type LockReleaseLockboxTokenPool_BouncedMessage =
    | AskToTransfer
    | JettonLockBox_Withdraw
    | JettonLockBox_GetInfo;
