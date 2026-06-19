// SPDX-License-Identifier: BUSL-1.1

const LockReleaseTokenPool_FACILITY_NAME = "link.chain.ton.ccip.LockReleaseTokenPool";
const LockReleaseTokenPool_FACILITY_ID = 263;  // (crc32(<facility>) % 640) + 10

enum Error {
    PendingReleaseAlreadyExists = LockReleaseTokenPool_FACILITY_ID * 100
    PendingReleaseNotFound
    UnexpectedReleaseConfirmationSender
    UnexpectedReleaseBounce
}
