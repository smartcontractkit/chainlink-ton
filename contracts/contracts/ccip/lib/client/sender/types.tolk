import "../../../../lib/utils";

type ExtraArgs = GenericExtraArgsV2 | SVMExtraArgsV1 | SuiExtraArgsV1;

// nolint:opcode : hex encoded bytes4(keccak256("CCIP EVMExtraArgsV2"))
struct (0x181dcf10) GenericExtraArgsV2 {
    gasLimit: uint256?;
    allowOutOfOrderExecution: bool;
}

// nolint:opcode : hex encoded bytes4(keccak256("CCIP SVMExtraArgsV1"))
struct (0x1f3b3aba) SVMExtraArgsV1 {
	computeUnits: uint32;
	accountIsWritableBitmap: uint64;
	allowOutOfOrderExecution: bool;
	tokenReceiver: uint256;
	accounts: SnakedCell<uint256>; // vec<slice>
}

// nolint:opcode : hex encoded bytes4(keccak256("CCIP SuiExtraArgsV1"))
struct (0x21ea4ca9) SuiExtraArgsV1 {
    gasLimit: uint256;
	allowOutOfOrderExecution: bool;
	tokenReceiver: uint256;
	receiverObjectIds: SnakedCell<uint256>; // vec<slice>
}

const SVM_EXTRA_ARGS_MAX_ACCOUNTS= 64;
const SVM_MESSAGING_ACCOUNTS_OVERHEAD = 2;
const SVM_ACCOUNT_BYTE_SIZE: uint256 = 32;
/// @dev The expected static payload size of a token transfer when Borsh encoded and submitted to SVM.
/// TokenPool extra data and offchain data sizes are dynamic, and should be accounted for separately.
const SVM_TOKEN_TRANSFER_DATA_OVERHEAD: uint256 = (4 + 32) // source_pool
+ 32 // token_address
+ 4 // gas_amount
+ 4 // extra_data overhead
+ 32 // amount
+ 32 // size of the token lookup table account
+ 32 // token-related accounts in the lookup table, over-estimated to 32, typically between 11 - 13
+ 32 // token account belonging to the token receiver, e.g ATA, not included in the token lookup table
+ 32 // per-chain token pool config, not included in the token lookup table
+ 32 // per-chain token billing config, not always included in the token lookup table
+ 32; // OffRamp pool signer PDA, not included in the token lookup table

const SUI_EXTRA_ARGS_MAX_RECEIVER_OBJECT_IDS = 64;
const SUI_MESSAGING_ACCOUNTS_OVERHEAD = 1;
const SUI_ACCOUNT_BYTE_SIZE: uint256 = 32;
/// @dev The expected static payload size of a token transfer when Borsh encoded and submitted to SUI.
/// TokenPool extra data and offchain data sizes are dynamic, and should be accounted for separately.
const SUI_TOKEN_TRANSFER_DATA_OVERHEAD: uint256 = (4 + 32) // source_pool
+ 32 // token_address
+ 4 // gas_amount
+ 4 // extra_data overhead
+ 32 // amount
+ 32 // size of the token lookup table account
+ 32 // token-related accounts in the lookup table, over-estimated to 32, typically between 11 - 13
+ 32 // token account belonging to the token receiver, e.g ATA, not included in the token lookup table
+ 32 // per-chain token pool config, not included in the token lookup table
+ 32; // per-chain token billing config, not always included in the token lookup table