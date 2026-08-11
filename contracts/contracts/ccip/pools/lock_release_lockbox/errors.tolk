// SPDX-License-Identifier: BUSL-1.1

const LockReleaseLockboxTokenPool_FACILITY_NAME = "link.chain.ton.ccip.LockReleaseLockboxTokenPool";
const LockReleaseLockboxTokenPool_FACILITY_ID = 487;  // (crc32(<facility>) % 640) + 10

enum LockReleaseLockBoxTokenPool_Error {
    LockboxNotConfigured = LockReleaseLockboxTokenPool_FACILITY_ID * 100
    UnexpectedLockboxConfirmationSender

    UnexpectedLockBounce
    InvalidOffRampAccountReply
    InvalidOffRampAccountNotification
    OffRampAccountDeployFailed
}
