package tonutils

import "fmt"

// This code is returned by smart contracts to indicate the reason for transaction failure or abnormal termination.
// For a comprehensive and up-to-date list of exit codes, refer to:
// - Tact documentation: https://docs.tact-lang.org/book/exit-codes/
// - TON documentation:  https://docs.ton.org/v3/documentation/tvm/tvm-exit-codes
type ExitCode int

// ExitCode for the message that deploys a contract will be ExitCode_InvalidIncomingMessage(130).
func (c ExitCode) IsSuccessfulDeployment() bool {
	return c == ExitCode_InvalidIncomingMessage
}

func (c ExitCode) IsSuccess() bool {
	return c == ExitCode_Success
}

const (
	ExitCode_Success                                                                  ExitCode = 0   // Standard successful execution exit code.
	ExitCode_Success_Variant                                                          ExitCode = 1   // Alternative successful execution exit code. Reserved, but does not occur.
	ExitCode_StackUnderflow                                                           ExitCode = 2   // Stack underflow.
	ExitCode_StackOverflow                                                            ExitCode = 3   // Stack overflow.
	ExitCode_IntegerOverflow                                                          ExitCode = 4   // Integer overflow.
	ExitCode_IntegerOutOfExpectedRange                                                ExitCode = 5   // Range check error — an integer is out of its expected range.
	ExitCode_InvalidOpcode                                                            ExitCode = 6   // Invalid TVM opcode.
	ExitCode_TypeCheckError                                                           ExitCode = 7   // Type check error.
	ExitCode_CellOverflow                                                             ExitCode = 8   // Cell overflow.
	ExitCode_CellUnderflow                                                            ExitCode = 9   // Cell underflow.
	ExitCode_DictionaryError                                                          ExitCode = 10  // Dictionary error.
	ExitCode_UnknownError                                                             ExitCode = 11  // Described in TVM docs as “Unknown error, may be thrown by user programs.”
	ExitCode_FatalError                                                               ExitCode = 12  // Fatal error. Thrown by TVM in situations deemed impossible.
	ExitCode_OutOfGasError                                                            ExitCode = 13  // Out of gas error.
	ExitCode_OutOfGasError_Variant                                                    ExitCode = -14 // Same as 13. Negative, so that it cannot be faked.
	ExitCode_VirtualizationError                                                      ExitCode = 14  // VM virtualization error. Reserved, but never thrown.
	ExitCode_ActionListIsInvalid                                                      ExitCode = 32  // Action list is invalid.
	ExitCode_ActionListIsTooLong                                                      ExitCode = 33  // Action list is too long.
	ExitCode_ActionIsInvalidOrNotSupported                                            ExitCode = 34  // Action is invalid or not supported.
	ExitCode_InvalidSourceAddressInOutboundMessage                                    ExitCode = 35  // Invalid source address in outbound message.
	ExitCode_InvalidDestinationAddressInOutboundMessage                               ExitCode = 36  // Invalid destination address in outbound message.
	ExitCode_NotEnoughToncoin                                                         ExitCode = 37  // Not enough Toncoin.
	ExitCode_NotEnoughExtraCurrencies                                                 ExitCode = 38  // Not enough extra currencies.
	ExitCode_OutboundMessageDoesNotFitIntoACellAfterRewriting                         ExitCode = 39  // Outbound message does not fit into a cell after rewriting.
	ExitCode_CannotProcessAMessage                                                    ExitCode = 40  // Cannot process a message — not enough funds, the message is too large, or its Merkle depth is too big.
	ExitCode_LibraryReferenceIsNull                                                   ExitCode = 41  // Library reference is null during library change action.
	ExitCode_LibraryChangeActionError                                                 ExitCode = 42  // Library change action error.
	ExitCode_ExceededMaximumNumberOfCellsInTheLibraryOrTheMaximumDepthOfTheMerkleTree ExitCode = 43  // Exceeded the maximum number of cells in the library or the maximum depth of the Merkle tree.
	ExitCode_AccountStateSizeExceededLimits                                           ExitCode = 50  // Account state size exceeded limits.
	ExitCode_NullReferenceException                                                   ExitCode = 128 // Null reference exception. Configurable since Tact 1.6.
	ExitCode_InvalidSerializationPrefix                                               ExitCode = 129 // Invalid serialization prefix.
	ExitCode_InvalidIncomingMessage                                                   ExitCode = 130 // Invalid incoming message — there is no receiver for the opcode of the received message.
	ExitCode_ConstraintsError                                                         ExitCode = 131 // Constraints error. Reserved, but never thrown.
	ExitCode_AccessDenied                                                             ExitCode = 132 // Access denied — someone other than the owner sent a message to the contract.
	ExitCode_ContractStopped                                                          ExitCode = 133 // Contract stopped.
	ExitCode_InvalidArgument                                                          ExitCode = 134 // Invalid argument.
	ExitCode_CodeOfAContractWasNotFound                                               ExitCode = 135 // Code of a contract was not found.
	ExitCode_InvalidStandardAddress                                                   ExitCode = 136 // Invalid standard address.
	ExitCode_NotABasechainAddress                                                     ExitCode = 138 // Not a basechain address. Available since Tact 1.6.3.
)

// Describe provides human-readable descriptions for common TON Virtual Machine (TVM) exit codes.
func (c ExitCode) Describe() string {
	switch c {
	case ExitCode_Success:
		return "Success"
	case ExitCode_StackUnderflow:
		return "Stack underflow"
	case ExitCode_StackOverflow:
		return "Stack overflow"
	case ExitCode_IntegerOverflow:
		return "Integer overflow"
	case ExitCode_IntegerOutOfExpectedRange:
		return "Integer out of expected range"
	case ExitCode_InvalidOpcode:
		return "Invalid opcode"
	case ExitCode_TypeCheckError:
		return "Type check error"
	case ExitCode_CellOverflow:
		return "Cell overflow"
	case ExitCode_CellUnderflow:
		return "Cell underflow"
	case ExitCode_DictionaryError:
		return "Dictionary error"
	case ExitCode_UnknownError:
		return "'Unknown' error"
	case ExitCode_FatalError:
		return "Fatal error"
	case ExitCode_OutOfGasError:
		return "Out of gas error"
	case ExitCode_VirtualizationError:
		return "Virtualization error"
	case ExitCode_ActionListIsInvalid:
		return "Action list is invalid"
	case ExitCode_ActionListIsTooLong:
		return "Action list is too long"
	case ExitCode_ActionIsInvalidOrNotSupported:
		return "Action is invalid or not supported"
	case ExitCode_InvalidSourceAddressInOutboundMessage:
		return "Invalid source address in outbound message"
	case ExitCode_InvalidDestinationAddressInOutboundMessage:
		return "Invalid destination address in outbound message"
	case ExitCode_NotEnoughToncoin:
		return "Not enough Toncoin"
	case ExitCode_NotEnoughExtraCurrencies:
		return "Not enough extra currencies"
	case ExitCode_OutboundMessageDoesNotFitIntoACellAfterRewriting:
		return "Outbound message does not fit into a cell after rewriting"
	case ExitCode_CannotProcessAMessage:
		return "Cannot process a message"
	case ExitCode_LibraryReferenceIsNull:
		return "Library reference is null"
	case ExitCode_LibraryChangeActionError:
		return "Library change action error"
	case ExitCode_ExceededMaximumNumberOfCellsInTheLibraryOrTheMaximumDepthOfTheMerkleTree:
		return "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree"
	case ExitCode_AccountStateSizeExceededLimits:
		return "Account state size exceeded limits"
	case ExitCode_NullReferenceException:
		return "Null reference exception"
	case ExitCode_InvalidSerializationPrefix:
		return "Invalid serialization prefix"
	case ExitCode_InvalidIncomingMessage:
		return "Invalid incoming message"
	case ExitCode_ConstraintsError:
		return "Constraints error"
	case ExitCode_AccessDenied:
		return "Access denied"
	case ExitCode_ContractStopped:
		return "Contract stopped"
	case ExitCode_InvalidArgument:
		return "Invalid argument"
	case ExitCode_CodeOfAContractWasNotFound:
		return "Code of a contract was not found"
	case ExitCode_InvalidStandardAddress:
		return "Invalid standard address"
	case ExitCode_NotABasechainAddress:
		return "Not a basechain address"
	default:
		return fmt.Sprintf("Non-standard exit code: %d", c)
	}
}
