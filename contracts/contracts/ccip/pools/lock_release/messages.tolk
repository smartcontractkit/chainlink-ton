// SPDX-License-Identifier: BUSL-1.1
import "../../../lib/jetton/messages"
import "../../executors/context_executor/messages"
import "types"

type LockReleaseTokenPool_InMessage =
    | ContextExecutor_ForwardNotification<LockReleaseTokenPool_ReleaseContext>;

type LockReleaseTokenPool_OutMessage =
    | AskToTransfer;

type LockReleaseTokenPool_BouncedMessage =
    | AskToTransfer;
