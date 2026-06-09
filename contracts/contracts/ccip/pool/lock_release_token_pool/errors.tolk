// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/utils.tolk"

const LockReleaseTokenPool_FACILITY_NAME = "link.chain.ton.ccip.LockReleaseTokenPool";
const LockReleaseTokenPool_FACILITY_ID = 263;  // (crc32(<facility>) % 640) + 10

enum Error {
    IncorrectJettonSender = LockReleaseTokenPool_FACILITY_ID * 100
    MissingTransferInitiator
    MissingForwardPayload
    AmountMismatch
    PendingReleaseAlreadyExists
    PendingReleaseNotFound
    UnexpectedReleaseConfirmationSender
    UnexpectedReleaseBounce
}
