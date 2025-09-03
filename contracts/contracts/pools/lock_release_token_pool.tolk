import "../lib/pools/token_pool"
import "../lib/pools/pool"
import "../lib/pools/ipool"
import "../lib/pools/token_pool/external_messages"
import "../lib/pools/token_pool/storage"
import "../lib/access/ownable_2step"
import "../lib/utils"
import "../lib/jetton/jetton_client"

import "./lock_release_token_pool/storage"
import "./lock_release_token_pool/messages"
import "./lock_release_token_pool/errors"
import "./lock_release_token_pool/external_messages"

tolk 1.0

// import {IERC20} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/IERC20.sol";
// import {SafeERC20} from
//   "@chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/utils/SafeERC20.sol";
/// @notice Token pool used for tokens on their native chain. This uses a lock and release mechanism.
/// Because of lock/unlock requiring liquidity, this pool contract also has function to add and remove
/// liquidity. This allows for proper bookkeeping for both user and liquidity provider balances.
/// @dev One token per LockReleaseTokenPool.

struct LockReleaseTokenPool {
    data: LockReleaseTokenPool_Data
}

// --- Methods ---
/// @dev Loads the LockReleaseTokenPool contract data from persistent storage.
fun LockReleaseTokenPool.load(): LockReleaseTokenPool {
    // Load the contract data from the persistent storage
    var data = LockReleaseTokenPool_Data.fromContractData();

    // Return the LockReleaseTokenPool instance with loaded data and hooks
    return LockReleaseTokenPool {
        data,
    };
}

fun LockReleaseTokenPool.ownable(self): Ownable2Step {
    return self.data.ownable.load();
}

fun LockReleaseTokenPool.tokenPool(self): TokenPool<LockReleaseTokenPool> {
    return TokenPool<LockReleaseTokenPool>{
        data: self.data.tokenPoolData.load(),
        ownable: self.ownable(),
        context: null,
        hooks: TokenPool_Hooks<LockReleaseTokenPool> {
            getRouter: null,
            _parseRemoteDecimals: null,
            getTokenDecimals: null,
            encodeLocalDecimals: null,
            calculateLocalAmount: null,
        }
    };
}

// TODO: handle bounced messages
fun onInternalMessage(in: InMessage) {
    /// Load the contract storage as MCMS and handle the message
    var lockReleaseTokenPool = LockReleaseTokenPool.load();

    if (lockReleaseTokenPool.tokenPool().onInternalMessage(in.senderAddress, in.valueCoins, in.body)) {
        lockReleaseTokenPool.data.storeAsContractData();
        return;
    }

    lockReleaseTokenPool.onInternalMessage(in.senderAddress, in.valueCoins, in.body);
}


// --- Message handlers ---


fun LockReleaseTokenPool.onInternalMessage(mutate self, sender: address, msgValue: coins, msgBody: slice) {
    var response: LockReleaseTokenPool_Response? = null;
    val msg = lazy LockReleaseTokenPool_InMessage.fromSlice(msgBody);
    match (msg) {
        Pool_LockOrBurnInV1 => {
            response = lockOrBurn(mutate self, sender, msgValue, msg);
        },
        Pool_ReleaseOrMintInV1 => {
            response = releaseOrMint(mutate self, sender, msgValue, msg);
        },
        LockReleaseTokenPool_GetRebalancer => {
            val rebalancer = self.handleGetRebalancer(sender);
            response = LockReleaseTokenPool_GetRebalancerResponse {
                queryId: msg.queryId,
                rebalancer: self.getRebalancer(),
            };
        },
        LockReleaseTokenPool_SetRebalancer => {
            self.handleSetRebalancer(sender, msg.rebalancer);
            response = LockReleaseTokenPool_SetRebalancerResponse {
                queryId: msg.queryId,
            };
        },
        // LockReleaseTokenPool_ProvideLiquidity => self.handleProvideLiquidity(sender),
        // LockReleaseTokenPool_WithdrawLiquidity => self.handleWithdrawLiquidity(sender),
        // LockReleaseTokenPool_TransferLiquidity => self.handleTransferLiquidity(sender),
        else => {
            return;
        }
    }

    
    createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: response,
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    
    /// Store the updated contract data
    self.data.storeAsContractData()
}

// --- Internal functions ---

// ================================================================
// │                        Lock or Burn                          │
// ================================================================
/// @notice Burn the token in the pool
/// @dev The _validateLockOrBurn check is an essential security check
fun lockOrBurn(mutate this: LockReleaseTokenPool, sender: address, msgValue: coins, lockOrBurnIn: Pool_LockOrBurnInV1): Pool_LockOrBurnOutV1 {
    this.tokenPool()._validateLockOrBurn(sender, lockOrBurnIn);

    val token = lazy this.tokenPool().data.i_token.load();
    emit(TOKENPOOL_LOCKEDORBURNED_TOPIC, TokenPool_LockedOrBurned {
        remoteChainSelector: lockOrBurnIn.remoteChainSelector,
        token: token.masterAddress,
        sender,
        amount: lockOrBurnIn.amount,
    });

    return Pool_LockOrBurnOutV1 {
        msg: lockOrBurnIn.msg,
        destTokenAddress: this.tokenPool().getRemoteToken(lockOrBurnIn.remoteChainSelector),
        destPoolData: this.tokenPool()._encodeLocalDecimals(),
    };
}

// ================================================================
// │                      Release or Mint                         │
// ================================================================
/// @notice Mint tokens from the pool to the recipient
/// @dev The _validateReleaseOrMint check is an essential security check
fun releaseOrMint(mutate this: LockReleaseTokenPool, sender: address, msgValue: coins, releaseOrMintIn: Pool_ReleaseOrMintInV1): Pool_ReleaseOrMintOutV1 {
    // Calculate the local amount
    val localAmount = this.tokenPool()._calculateLocalAmount(
        releaseOrMintIn.sourceDenominatedAmount,
        this.tokenPool()._parseRemoteDecimals(releaseOrMintIn.sourcePoolData),
    );

    // TODO revisit. This is the other way arround in the original contracts.
    this.tokenPool()._validateReleaseOrMint(releaseOrMintIn, localAmount);


    val ccipSend = lazy releaseOrMintIn.msg.load();

    // Mint to the receiver
    this.tokenPool().data.i_token.load().sendSimple(
        JettonMessageOptions {
            bounce: true,
            value: 0,
        },    
        SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE,
        ccipSend.queryId,
        localAmount,
        releaseOrMintIn.receiver,
        contract.getAddress(), // receive transfer confirmation and recover extra TON
    );

    // TODO this should be emitted when we receive the transfer receipt
    val token = lazy this.tokenPool().data.i_token.load();
    emit(TOKENPOOL_RELEASEDORMINTED_TOPIC, TokenPool_ReleasedOrMinted {
        remoteChainSelector: releaseOrMintIn.remoteChainSelector,
        token: token.masterAddress,
        sender: sender,
        recipient: releaseOrMintIn.receiver,
        amount: localAmount,
    });

    return Pool_ReleaseOrMintOutV1{ msg: releaseOrMintIn.msg, destinationAmount: localAmount };
}

fun LockReleaseTokenPool.handleGetRebalancer(self, sender: address): address {
    return self.getRebalancer();
}

/// @notice Gets rebalancer, can be address(0) if none is configured.
/// @return The current liquidity manager.
fun LockReleaseTokenPool.getRebalancer(self): address {
    return self.data.s_rebalancer;
}

fun LockReleaseTokenPool.handleSetRebalancer(mutate self, sender: address, rebalancer: address) {
    return self.setRebalancer(sender, rebalancer);
}

/// @notice Sets the rebalancer address.
/// @dev Address(0) can be used to disable the rebalancer.
/// @dev Only callable by the owner.
fun LockReleaseTokenPool.setRebalancer(mutate self, sender: address, rebalancer: address) {
    self.tokenPool().ownable.requireOwner(sender);
    val oldRebalancer: address = self.data.s_rebalancer;

    self.data.s_rebalancer = rebalancer;

    emit(LOCK_RELEASE_TOKEN_POOL_REBALANCER_SET_TOPIC, LockReleaseTokenPool_RebalancerSet{ oldRebalancer, newRebalancer: rebalancer });
}

/// @notice Adds liquidity to the pool. The tokens should be approved first.
/// @param amount The amount of liquidity to provide.
// fun LockReleaseTokenPool.provideLiquidity(mutate self, sender: address, amount: uint256): bool {
//     try {
//         if (self.data.s_rebalancer != sender) {
//             throw TokenPool_ERROR_UNAUTHORIZED;
//         }

//         self.data.tokenPool.i_token.safeTransferFrom(sender, contract.getAddress(), amount);
//         emit(LOCK_RELEASE_TOKEN_POOL_LIQUIDITY_ADDED_TOPIC, LiquidityAdded { provider: sender, amount });
//         return true;
//     } catch {
//         return false;
//     }
// }

/// @notice Removes liquidity to the pool
/// @param amount The amount of liquidity to remove.
// fun LockReleaseTokenPool.withdrawLiquidity(mutate self, sender: address, amount: uint256): bool {
//     try {
//         if (self.data.s_rebalancer != sender) {
//             throw TokenPool_ERROR_UNAUTHORIZED;
//         }

//         self.data.tokenPool.i_token.safeTransfer(sender, amount);
//         emit(LOCK_RELEASE_TOKEN_POOL_LIQUIDITY_REMOVED_TOPIC, LiquidityRemoved { provider: sender, amount });
//         return true;
//     } catch {
//         return false;
//     }
// }

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
// fun LockReleaseTokenPool.transferLiquidity(
//     mutate self,
//     sender: address,
//     from: address,
//     amount: uint256,
// ) {
//     self.data.tokenPool.ownable().requireOwner(sender);
//     var transferAmount = amount;
//     if (amount == 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff) { // type(uint256).max
//         transferAmount = self.data.tokenPool.i_token.balanceOf(from);
//     }

//     LockReleaseTokenPool(from).withdrawLiquidity(sender, transferAmount);

//     emit(LiquidityTransferred({ from, amount: transferAmount }));
// }
