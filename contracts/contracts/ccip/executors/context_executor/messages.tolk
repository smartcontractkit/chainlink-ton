// SPDX-License-Identifier: BUSL-1.1
import "types"

struct (0x3c50a300) ContextExecutor_Init<T> {
    queryId: uint64;
    context: Cell<T>;
    forwardFrom: array<address>;
}

struct (0x3c50a301) ContextExecutor_Ask {
    queryId: uint64;

    // Per request context
    forwardPayload: cell;
}

type ContextExecutor_InMessage<T> =
    | ContextExecutor_Init<T>
    | ContextExecutor_Ask;

struct (0x3c50a302) ContextExecutor_Reply<T> {
    queryId: uint64;

    id: uint64;
    context: Cell<T>;
    forwardFrom: array<address>;

    // Per request context
    forwardPayload: cell;
}

struct (0x3c50a303) ContextExecutor_ForwardNotification<T> {
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
