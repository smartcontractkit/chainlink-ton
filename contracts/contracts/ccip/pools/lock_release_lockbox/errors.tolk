// SPDX-License-Identifier: BUSL-1.1

const LockReleaseLockboxTokenPool_FACILITY_NAME = "link.chain.ton.ccip.LockReleaseLockboxTokenPool";
const LockReleaseLockboxTokenPool_FACILITY_ID = 487;  // (crc32(<facility>) % 640) + 10

enum LockReleaseLockBoxTokenPool_Error {
    PendingLockAlreadyExists = LockReleaseLockboxTokenPool_FACILITY_ID * 100
    PendingLockNotFound
    PendingReleaseAlreadyExists
    PendingReleaseNotFound
    LockboxNotConfigured
    UnexpectedLockboxConfirmationSender

    UnexpectedLockBounce
}
