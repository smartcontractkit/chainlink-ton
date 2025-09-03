tolk 1.0

import "../../lib/pools/token_pool/storage"
import "../../lib/access/ownable_2step"

/// @dev LockReleaseTokenPool contract struct with optional hooks for virtual functions
struct LockReleaseTokenPool_Data {
    /// ID allows multiple independent instances
    id: uint32
    /// @notice The address of the rebalancer.
    s_rebalancer: address
    
    /// Ownable trait data
    ownable: Cell<Ownable2Step>,

    tokenPoolData: Cell<TokenPool_Data>
}

/// Load from contract data using auto-serialization.
@inline
fun LockReleaseTokenPool_Data.fromContractData(): LockReleaseTokenPool_Data {
    return LockReleaseTokenPool_Data.fromCell(contract.getData())
}

/// Store as contract data into persistent storage using auto-serialization.
@inline
fun LockReleaseTokenPool_Data.storeAsContractData(self) {
    contract.setData(self.toCell());
}
