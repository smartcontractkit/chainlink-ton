import "../offramp/types"
import "../../lib/funding/withdrawable"

type MerkleRoot_InMessage = 
    | MerkleRoot_Validate
    | Withdrawable_Withdraw
    ;

//crc32('MerkleRoot_Validate')
struct (0x38ede91) MerkleRoot_Validate {
    message: Cell<Any2TVMRampMessage>,
    metadataHash: uint256,
}
