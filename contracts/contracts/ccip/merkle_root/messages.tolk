import "../offramp/types"

type MerkleRoot_InMessage = MerkleRoot_Validate;

//crc32('MerkleRoot_Validate')
struct (0x38ede915) MerkleRoot_Validate {
    message: Cell<Any2TVMRampMessage>,
    metadataHash: uint256,
}
