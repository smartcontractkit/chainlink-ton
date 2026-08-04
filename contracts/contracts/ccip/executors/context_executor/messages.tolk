// SPDX-License-Identifier: BUSL-1.1
import "types"

/// @notice Sets the context and forwardFrom whitelist on an existing ContextExecutor.
/// Only callable by the owner.
struct (0x44e61eec) ContextExecutor_Set<T> {
    queryId: uint64;
    context: Cell<T>;
    forwardFrom: array<address>;
}

/// @notice Queries or updates the ContextExecutor state.
/// When `done=true`, the executor self-destructs after replying.
struct (0xcad4d1d0) ContextExecutor_Ask {
    queryId: uint64;

    // Per request context
    forwardPayload: cell;

    // Close the context executor after this request is processed.
    done: bool;
}

/// @notice Union of all incoming messages the ContextExecutor accepts.
type ContextExecutor_InMessage<T> =
    | ContextExecutor_Set<T>
    | ContextExecutor_Ask;

struct (0x93e5bbc5) ContextExecutor_Reply<T> {
    queryId: uint64;

    id: uint64;
    context: Cell<T>;
    forwardFrom: array<address>;

    // Per request context
    forwardPayload: cell;

    // Whether the context executor was closed.
    done: bool;
}

/// @notice Forwarded notification sent to the owner pool when a message arrives
/// from a whitelisted `forwardFrom` address. Carries the original context and message.
/// @dev After forwarding, `forwardFrom` is cleared so the executor only forwards once.
struct (0x55b412b9) ContextExecutor_ForwardNotification<T> {
    // Notice: no queryId here, because it's not a reply to a specific request

    id: uint64;
    context: Cell<T>;
    forwardFrom: array<address>;

    // Forwarded in-message
    message: Cell<ContextExecutor_InMessageForward>;
}

/// @notice Union of all outgoing messages the ContextExecutor can send.
type ContextExecutor_OutMessage<T> =
    | ContextExecutor_Reply<T>
    | ContextExecutor_ForwardNotification<T>;
