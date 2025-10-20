import "../offramp/types"

type MerkleRoot_InMessage = MerkleRoot_Validate | MerkleRoot_CCIPReceiveBounced | MerkleRoot_CCIPReceiveConfirm;

//crc32('MerkleRoot_Validate')
struct (0x38ede91) MerkleRoot_Validate {
    message: Any2TVMRampMessage,
    //TODO: token data
}

//crc32('MerkleRoot_CCIPReceiveConfirm')
struct (0x81650c13) MerkleRoot_CCIPReceiveConfirm {
    receiver: address
}

//crc32('MerkleRoot_CCIPReceiveBounced')
struct(0x845e303f) MerkleRoot_CCIPReceiveBounced {
    receiver: address
}



