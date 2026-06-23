// SPDX-License-Identifier: BUSL-1.1
import "types"

struct (0x44e61eec) ContextExecutor_Set<T> {
    queryId: uint64;
    context: Cell<T>;
    forwardFrom: array<address>;
}

struct (0xcad4d1d0) ContextExecutor_Ask {
    queryId: uint64;

    // Per request context
    forwardPayload: cell;

    // Close the context executor after this request is processed.
    done: bool;
}

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

struct (0x55b412b9) ContextExecutor_ForwardNotification<T> {
    // Notice: no queryId here, because it's not a reply to a specific request

    id: uint64;
    context: Cell<T>;
    forwardFrom: array<address>;

    // Forwarded in-message
    message: Cell<ContextExecutor_InMessageForward>;
}

type ContextExecutor_OutMessage<T> =
    | ContextExecutor_Reply<T>
    | ContextExecutor_ForwardNotification<T>;
