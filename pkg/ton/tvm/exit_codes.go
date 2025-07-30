package tvm

import (
	"fmt"
)

// This code is returned by smart contracts to indicate the reason for transaction failure or abnormal termination.
// For a comprehensive and up-to-date list of exit codes, refer to:
// - Tact documentation: https://docs.tact-lang.org/book/exit-codes/
// - TON documentation:  https://docs.ton.org/v3/documentation/tvm/tvm-exit-codes
type ExitCode int32

// ExitCode for the message that deploys a contract can be different depending on the contract implementation.
// If the contract has an empty received message handler, and you are deploying it with an empty message, it will return ExitCodeSuccess.
// If the contract does not handle empty messages, it will return ExitCode_Tolk_UnmatchedOpcode or ExitCode_Tact_InvalidIncomingMessage.
// [NOT IMPLEMENTED] If you are deploying a contract with a non-empty message, it will return ExitCodeSuccess if the contract handles the message correctly.
// TODO it can also be other exit codes. This is the code returned by contracts not implementing the empty received message handler.
func (c ExitCode) IsSuccessfulDeployment() bool {
	return c == ExitCodeSuccess || // If contract has empty receiver
		c == ExitCodeTolkUnmatchedOpcode || c == ExitCodeTactInvalidIncomingMessage // If contract doesn't handle empty messages
}

const (
	/// TVM exit codes

	ExitCodeSuccess                                                                  ExitCode = 0   // Standard successful execution exit code.
	ExitCodeSuccessVariant                                                           ExitCode = 1   // Alternative successful execution exit code. Reserved, but does not occur.
	ExitCodeStackUnderflow                                                           ExitCode = 2   // Stack underflow.
	ExitCodeStackOverflow                                                            ExitCode = 3   // Stack overflow.
	ExitCodeIntegerOverflow                                                          ExitCode = 4   // Integer overflow.
	ExitCodeIntegerOutOfExpectedRange                                                ExitCode = 5   // Range check error — an integer is out of its expected range.
	ExitCodeInvalidOpcode                                                            ExitCode = 6   // Invalid TVM opcode.
	ExitCodeTypeCheckError                                                           ExitCode = 7   // Type check error.
	ExitCodeCellOverflow                                                             ExitCode = 8   // Cell overflow.
	ExitCodeCellUnderflow                                                            ExitCode = 9   // Cell underflow.
	ExitCodeDictionaryError                                                          ExitCode = 10  // Dictionary error.
	ExitCodeUnknownError                                                             ExitCode = 11  // Described in TVM docs as “Unknown error, may be thrown by user programs.”
	ExitCodeFatalError                                                               ExitCode = 12  // Fatal error. Thrown by TVM in situations deemed impossible.
	ExitCodeOutOfGasError                                                            ExitCode = 13  // Out of gas error.
	ExitCodeOutOfGasErrorVariant                                                     ExitCode = -14 // Same as 13. Negative, so that it cannot be faked.
	ExitCodeVirtualizationError                                                      ExitCode = 14  // VM virtualization error. Reserved, but never thrown.
	ExitCodeActionListIsInvalid                                                      ExitCode = 32  // Action list is invalid.
	ExitCodeActionListIsTooLong                                                      ExitCode = 33  // Action list is too long.
	ExitCodeActionIsInvalidOrNotSupported                                            ExitCode = 34  // Action is invalid or not supported.
	ExitCodeInvalidSourceAddressInOutboundMessage                                    ExitCode = 35  // Invalid source address in outbound message.
	ExitCodeInvalidDestinationAddressInOutboundMessage                               ExitCode = 36  // Invalid destination address in outbound message.
	ExitCodeNotEnoughToncoin                                                         ExitCode = 37  // Not enough Toncoin.
	ExitCodeNotEnoughExtraCurrencies                                                 ExitCode = 38  // Not enough extra currencies.
	ExitCodeOutboundMessageDoesNotFitIntoACellAfterRewriting                         ExitCode = 39  // Outbound message does not fit into a cell after rewriting.
	ExitCodeCannotProcessAMessage                                                    ExitCode = 40  // Cannot process a message — not enough funds, the message is too large, or its Merkle depth is too big.
	ExitCodeLibraryReferenceIsNull                                                   ExitCode = 41  // Library reference is null during library change action.
	ExitCodeLibraryChangeActionError                                                 ExitCode = 42  // Library change action error.
	ExitCodeExceededMaximumNumberOfCellsInTheLibraryOrTheMaximumDepthOfTheMerkleTree ExitCode = 43  // Exceeded the maximum number of cells in the library or the maximum depth of the Merkle tree.
	ExitCodeAccountStateSizeExceededLimits                                           ExitCode = 50  // Account state size exceeded limits.

	/// Tolk exit codes

	ExitCodeTolkUnmatchedOpcode ExitCode = 63 // Tolk compiler: Unmatched opcode. Thrown by Tolk when it receives an opcode that it does not recognize.

	/// Tact exit codes

	ExitCodeNullReferenceException         ExitCode = 128 // Tact compiler: Null reference exception. Configurable since Tact 1.6.
	ExitCodeInvalidSerializationPrefix     ExitCode = 129 // Tact compiler: Invalid serialization prefix.
	ExitCodeTactInvalidIncomingMessage     ExitCode = 130 // Tact compiler: Invalid incoming message — there is no receiver for the opcode of the received message.
	ExitCodeTactConstraintsError           ExitCode = 131 // Tact compiler: Constraints error. Reserved, but never thrown.
	ExitCodeTactAccessDenied               ExitCode = 132 // Tact compiler: Access denied — someone other than the owner sent a message to the contract.
	ExitCodeTactContractStopped            ExitCode = 133 // Tact compiler: Contract stopped.
	ExitCodeTactInvalidArgument            ExitCode = 134 // Tact compiler: Invalid argument.
	ExitCodeTactCodeOfAContractWasNotFound ExitCode = 135 // Tact compiler: Code of a contract was not found.
	ExitCodeTactInvalidStandardAddress     ExitCode = 136 // Tact compiler: Invalid standard address.
	ExitCodeTactNotABasechainAddress       ExitCode = 138 // Tact compiler: Not a basechain address. Available since Tact 1.6.3.
)

// Describe provides human-readable descriptions for common TON Virtual Machine (TVM) exit codes.
func (c ExitCode) Describe() string {
	switch c {
	case ExitCodeSuccess:
		return "Success"
	case ExitCodeStackUnderflow:
		return "Stack underflow"
	case ExitCodeStackOverflow:
		return "Stack overflow"
	case ExitCodeIntegerOverflow:
		return "Integer overflow"
	case ExitCodeIntegerOutOfExpectedRange:
		return "Integer out of expected range"
	case ExitCodeInvalidOpcode:
		return "Invalid opcode"
	case ExitCodeTypeCheckError:
		return "Type check error"
	case ExitCodeCellOverflow:
		return "Cell overflow"
	case ExitCodeCellUnderflow:
		return "Cell underflow"
	case ExitCodeDictionaryError:
		return "Dictionary error"
	case ExitCodeUnknownError:
		return "'Unknown' error"
	case ExitCodeFatalError:
		return "Fatal error"
	case ExitCodeOutOfGasError:
		return "Out of gas error"
	case ExitCodeVirtualizationError:
		return "Virtualization error"
	case ExitCodeActionListIsInvalid:
		return "Action list is invalid"
	case ExitCodeActionListIsTooLong:
		return "Action list is too long"
	case ExitCodeActionIsInvalidOrNotSupported:
		return "Action is invalid or not supported"
	case ExitCodeInvalidSourceAddressInOutboundMessage:
		return "Invalid source address in outbound message"
	case ExitCodeInvalidDestinationAddressInOutboundMessage:
		return "Invalid destination address in outbound message"
	case ExitCodeNotEnoughToncoin:
		return "Not enough Toncoin"
	case ExitCodeNotEnoughExtraCurrencies:
		return "Not enough extra currencies"
	case ExitCodeOutboundMessageDoesNotFitIntoACellAfterRewriting:
		return "Outbound message does not fit into a cell after rewriting"
	case ExitCodeCannotProcessAMessage:
		return "Cannot process a message"
	case ExitCodeLibraryReferenceIsNull:
		return "Library reference is null"
	case ExitCodeLibraryChangeActionError:
		return "Library change action error"
	case ExitCodeExceededMaximumNumberOfCellsInTheLibraryOrTheMaximumDepthOfTheMerkleTree:
		return "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree"
	case ExitCodeAccountStateSizeExceededLimits:
		return "Account state size exceeded limits"
	case ExitCodeNullReferenceException:
		return "Null reference exception"
	case ExitCodeInvalidSerializationPrefix:
		return "Invalid serialization prefix"
	case ExitCodeTactInvalidIncomingMessage:
		return "Invalid incoming message"
	case ExitCodeTactConstraintsError:
		return "Constraints error"
	case ExitCodeTactAccessDenied:
		return "Access denied"
	case ExitCodeTactContractStopped:
		return "Contract stopped"
	case ExitCodeTactInvalidArgument:
		return "Invalid argument"
	case ExitCodeTactCodeOfAContractWasNotFound:
		return "Code of a contract was not found"
	case ExitCodeTactInvalidStandardAddress:
		return "Invalid standard address"
	case ExitCodeTactNotABasechainAddress:
		return "Not a basechain address"
	default:
		return fmt.Sprintf("Non-standard exit code: %d", c)
	}
}
