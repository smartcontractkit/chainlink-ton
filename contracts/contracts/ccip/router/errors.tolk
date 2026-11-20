// SPDX-License-Identifier: BUSL-1.1
import "types"

enum Router_Error {
    DestChainNotEnabled = Router_FACILITY_ID * 100
    SourceChainNotEnabled
    SenderIsNotOffRamp
    OffRampNotSetForSelector
    OffRampAddressMismatch
    SubjectCursed
    NotOnRamp
    MissingTokenAmounts
    NoMultiTokenTransfers
    InsufficientFee
    TokenAmountMismatch
    ForwardPayloadIsNotCCIPSend
    SourceChainSelectorMismatch
    SenderIsNotDepositAccount
    SenderIsNotSenderAccount
    DepositAccountWalletUnavailable
    /// The withdraw's forward payload doesn't name the executor that requested it.
    WithdrawExecutorMismatch
    SenderAccountWithdrawFailed
    FeePaymentsWithJettonsNotSupported
    /// A legacy 256-bit bounce. Only sends whose bounce is not handled yet produce them.
    UnhandledLegacyBounce
}
