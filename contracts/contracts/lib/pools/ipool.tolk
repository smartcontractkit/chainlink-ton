import "./pool"
// import "./ipool/messages"

tolk 1.0

struct IPool<T> {
    hooks: IPool_Hooks<T>
}

struct IPool_Hooks<T> {
    lockOrBurn: ((T, address, coins, Pool_LockOrBurnInV1) -> Pool_LockOrBurnOutV1)
    releaseOrMint: ((T, address, coins, Pool_ReleaseOrMintInV1) -> Pool_ReleaseOrMintOutV1)
}

type IPool_InMessage =
    | Pool_LockOrBurnInV1
    | Pool_ReleaseOrMintInV1

type IPool_Response =
    | Pool_LockOrBurnOutV1
    | Pool_ReleaseOrMintOutV1

/// @notice Handles incoming messages for IPool
@inline
fun IPool<T>.onInternalMessage(
    mutate self,
    sender: address,
    msgValue: coins,
    msgBody: slice,
): bool {
    val msg = lazy IPool_InMessage.fromSlice(msgBody);
    var response: IPool_Response? = null;

    match (msg) {
        Pool_LockOrBurnInV1 =>
            response = self.hooks.lockOrBurn(null, sender, msgValue, msg),
        Pool_ReleaseOrMintInV1 =>
            response = self.hooks.releaseOrMint(null, sender, msgValue, msg),
        else => return false
    }

    createMessage({
        bounce: false,
        value: 0,
        dest: sender,
        body: response,
    }).send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    return true
}

