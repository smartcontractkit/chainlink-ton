import "./token_pool"
import "../lib/access/ownable_2step"

tolk 1.0

// import {IERC20} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/IERC20.sol";
// import {SafeERC20} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/utils/SafeERC20.sol";
/// @notice Token pool used for tokens on their native chain. This uses a lock and release mechanism.
/// Because of lock/unlock requiring liquidity, this pool contract also has function to add and remove
/// liquidity. This allows for proper bookkeeping for both user and liquidity provider balances.
/// @dev One token per LockReleaseTokenPool.
const ERROR_INSUFFICIENT_LIQUIDITY = 1001

// --- Messages - incoming ---
/// @notice Gets rebalancer address
struct (0x1a2b3c4d) LockReleaseTokenPool_GetRebalancer {
    queryId: uint64
}

/// @notice Sets the rebalancer address.
/// @dev Address(0) can be used to disable the rebalancer.
/// @dev Only callable by the owner.
struct (0x2b3c4d5e) LockReleaseTokenPool_SetRebalancer {
    queryId: uint64
    rebalancer: address
}

/// @notice Adds liquidity to the pool. The tokens should be approved first.
/// @param amount The amount of liquidity to provide.
struct (0x3c4d5e6f) LockReleaseTokenPool_ProvideLiquidity {
    queryId: uint64
    amount: uint256
}

/// @notice Removed liquidity to the pool. The tokens will be sent to msg.sender.
/// @param amount The amount of liquidity to remove.
struct (0x4d5e6f70) LockReleaseTokenPool_WithdrawLiquidity {
    queryId: uint64
    amount: uint256
}

/// @notice Transfer liquidity from an older version of the pool to this pool.
/// @param from The address of the old pool.
/// @param amount The amount of liquidity to transfer. If uint256.max is passed, all liquidity will be transferred.
struct (0x5e6f7081) LockReleaseTokenPool_TransferLiquidity {
    queryId: uint64
    from: address
    amount: uint256
}

/// @dev Union of all incoming messages.
type LockReleaseTokenPool_InMessage =
    | LockReleaseTokenPool_GetRebalancer
    | LockReleaseTokenPool_SetRebalancer
    | LockReleaseTokenPool_ProvideLiquidity
    | LockReleaseTokenPool_WithdrawLiquidity
    | LockReleaseTokenPool_TransferLiquidity

// --- Messages - outgoing ---
/// @notice Response for GetRebalancer query
struct (0xa1b2c3d4) LockReleaseTokenPool_GetRebalancerResponse {
    queryId: uint64
    rebalancer: address
}

/// @notice Confirmation for SetRebalancer operation
struct (0xb2c3d4e5) LockReleaseTokenPool_SetRebalancerResponse {
    queryId: uint64
    error: 
}

/// @notice Confirmation for ProvideLiquidity operation
struct (0xc3d4e5f6) LockReleaseTokenPool_ProvideLiquidityResponse {
    queryId: uint64
    error: 
}

/// @notice Confirmation for WithdrawLiquidity operation
struct (0xd4e5f607) LockReleaseTokenPool_WithdrawLiquidityResponse {
    queryId: uint64
    error: 
}

/// @notice Confirmation for TransferLiquidity operation
struct (0xe5f60718) LockReleaseTokenPool_TransferLiquidityResponse {
    queryId: uint64
    error: 
}

// Event
struct RebalancerSet {
    oldRebalancer: address
    newRebalancer: address
}

// Event
struct LiquidityAdded {
    provider: address
    amount: uint256
}

// Event
struct LiquidityRemoved {
    provider: address
    amount: uint256
}

// Event
struct LiquidityTransferred {
    from: address
    amount: uint256
}

struct LockReleaseTokenPool<T> {
    data: LockReleaseTokenPool_Data
    tokenPool: TokenPool<LockReleaseTokenPool_Data>
    /// Runtime hooks (extensions)
    context: T? = null
    hooks: LockReleaseTokenPool_Hooks<T>? = null
}

// --- Hooks struct (extensions) ---
/// @dev Hook extensions exposed by the LockReleaseTokenPool contract.
struct LockReleaseTokenPool_Hooks<T> {
    /// Hook for _releaseOrMint virtual function override
    releaseOrMint: ((T?, address, uint256) -> void)?
}

/// @dev LockReleaseTokenPool contract struct with optional hooks for virtual functions
struct LockReleaseTokenPool_Data {
    /// @notice The address of the rebalancer.
    s_rebalancer: address
    tokenPool: TokenPool
}

/// Load from contract data using auto-serialization.
@inline
fun MCMS_Data.fromContractData() {
    return MCMS_Data.fromCell(contract.getData());
}

/// Store as contract data into persistent storage using auto-serialization.
@inline
fun MCMS_Data.storeAsContractData(self) {
    contract.setData(self.toCell());
}

// TODO: handle bounced messages
fun onInternalMessage(in: InMessage) {
    /// Load the contract storage as MCMS and handle the message
    var lockReleaseTokenPool = LockReleaseTokenPool<bool>.load();
    lockReleaseTokenPool.onInternalMessage(in.senderAddress, in.valueCoins, in.body);

    /// Store the updated contract data
    lockReleaseTokenPool.data.storeAsContractData();
}

// --- Methods ---
/// @dev Loads the LockReleaseTokenPool contract data from persistent storage.
fun LockReleaseTokenPool<T>.load(context: T? = null, hooks: LockReleaseTokenPool_Hooks<T>? = null): LockReleaseTokenPool<T> {
    // Load the contract data from the persistent storage
    var data = LockReleaseTokenPool_Data.fromContractData();

    // Return the LockReleaseTokenPool instance with loaded data and hooks
    return LockReleaseTokenPool<T> {
        data,
        tokenPool: TokenPool<LockReleaseTokenPool_Data> {
            data: data.tokenPoolData,
            hooks: TokenPool_Hooks {
                releaseOrMint: self._releaseOrMint
            }
        },
        context,
        hooks,
    };
}

// --- Message handlers ---
/// @notice Handles incoming messages for LockReleaseTokenPool
@inline
fun LockReleaseTokenPool<T>.onInternalMessage(
    mutate self,
    msgSender: address,
    msgValue: coins,
    msgBody: slice,
): bool {
    // First try to handle LockReleaseTokenPool specific messages
    try {
        val msg = lazy LockReleaseTokenPool_InMessage.fromSlice(msgBody);
        match (msg) {
            LockReleaseTokenPool_GetRebalancer => self.handleGetRebalancer(msgSender),
            LockReleaseTokenPool_SetRebalancer => self.handleSetRebalancer(msgSender),
            LockReleaseTokenPool_ProvideLiquidity => self.handleProvideLiquidity(msgSender),
            LockReleaseTokenPool_WithdrawLiquidity => self.handleWithdrawLiquidity(msgSender),
            LockReleaseTokenPool_TransferLiquidity => self.handleTransferLiquidity(msgSender),
        }

        return true;
    } catch {
        // Try to handle TokenPool messages through delegation
        return self.data.tokenPool.onInternalMessage(msgSender, msgValue, msgBody);
    }
}

// --- Internal functions ---
/// @notice Hook-aware implementation of _releaseOrMint
fun LockReleaseTokenPool<T>._releaseOrMint(mutate self, receiver: address, amount: uint256) {
    if (self.hooks != null && self.hooks.releaseOrMint != null) {
        return self.hooks.releaseOrMint(self.context, receiver, amount); // extension hook
    }

    // Default implementation - transfer tokens from pool to receiver
    self.tokenPool.i_token.safeTransfer(receiver, amount);
}

fun LockReleaseTokenPool<T>.handleGetRebalancer(self, sender: address): address {
    const;
    response = LockReleaseTokenPool_GetRebalancerResponse {
        queryId: request.queryId,
        rebalancer: self.getRebalancer(),
    };
    sendMessage(sender, response);
}

/// @notice Gets rebalancer, can be address(0) if none is configured.
/// @return The current liquidity manager.
fun LockReleaseTokenPool<T>.getRebalancer(self): address {
    return self.s_rebalancer;
}

/// @notice Sets the rebalancer address.
/// @dev Address(0) can be used to disable the rebalancer.
/// @dev Only callable by the owner.
fun LockReleaseTokenPool<T>.setRebalancer(mutate self, sender: address, rebalancer: address): bool {
    try {
        self.tokenPool.ownable.requireOwner(sender);
        val oldRebalancer: address = self.s_rebalancer;

        self.s_rebalancer = rebalancer;

        emit(RebalancerSet { oldRebalancer, newRebalancer: rebalancer });
        return true;
    } catch {
        return false;
    }
}

/// @notice Adds liquidity to the pool. The tokens should be approved first.
/// @param amount The amount of liquidity to provide.
fun LockReleaseTokenPool<T>.provideLiquidity(mutate self, sender: address, amount: uint256): bool {
    try {
        if (self.data.s_rebalancer != sender) {
            throw ERROR_UNAUTHORIZED;
        }

        self.data.tokenPool.i_token.safeTransferFrom(sender, contract.getAddress(), amount);
        emit(LiquidityAdded { provider: sender, amount });
        return true;
    } catch {
        return false;
    }
}

/// @notice Removes liquidity to the pool
/// @param amount The amount of liquidity to remove.
fun LockReleaseTokenPool<T>.withdrawLiquidity(mutate self, sender: address, amount: uint256): bool {
    try {
        if (self.data.s_rebalancer != sender) {
            throw ERROR_UNAUTHORIZED;
        }

        self.data.tokenPool.i_token.safeTransfer(sender, amount);
        emit(LiquidityRemoved { provider: sender, amount });
        return true;
    } catch {
        return false;
    }
}

/// @notice This function can be used to transfer liquidity from an older version of the pool to this pool. To do so
/// this pool will have to be set as the rebalancer in the older version of the pool. This allows it to transfer the
/// funds in the old pool to the new pool.
/// @dev When upgrading a LockRelease pool, this function can be called at the same time as the pool is changed in the
/// TokenAdminRegistry. This allows for a smooth transition of both liquidity and transactions to the new pool.
/// Alternatively, when no multicall is available, a portion of the funds can be transferred to the new pool before
/// changing which pool CCIP uses, to ensure both pools can operate. Then the pool should be changed in the
/// TokenAdminRegistry, which will activate the new pool. All new transactions will use the new pool and its
/// liquidity. Finally, the remaining liquidity can be transferred to the new pool using this function one more time.
/// @param from The address of the old pool.
/// @param amount The amount of liquidity to transfer. If uint256.max is passed, all liquidity will be transferred.
fun LockReleaseTokenPool<T>.transferLiquidity(
    mutate self,
    sender: address,
    from: address,
    amount: uint256,
): bool {
    try {
        self.data.tokenPool.ownable.requireOwner(sender);
        var transferAmount = amount;
        if (amount == type(uint256).max) {
            transferAmount = self.data.tokenPool.i_token.balanceOf(from);
        }

        LockReleaseTokenPool(from).withdrawLiquidity(sender, transferAmount);

        emit(LiquidityTransferred({ from, amount: transferAmount }));
        return true;
    } catch {
        return false;
    }
}
