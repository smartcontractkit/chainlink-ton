// SPDX-License-Identifier: BUSL-1.1

const BurnMintTokenPool_FACILITY_NAME = "link.chain.ton.ccip.BurnMintTokenPool";
const BurnMintTokenPool_FACILITY_ID = 412;  // (crc32(<facility>) % 640) + 10

enum Error {
    IncorrectJettonSender = BurnMintTokenPool_FACILITY_ID * 100
    MissingTransferInitiator
    MissingForwardPayload
    AmountMismatch
    PendingBurnAlreadyExists
    PendingBurnNotFound
    PendingMintAlreadyExists
    PendingMintNotFound
    UnexpectedBurnConfirmationSender
    UnexpectedMintConfirmationSender
}