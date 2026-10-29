// SPDX-License-Identifier: MIT

import "../../../../lib/utils"
import "../../cross_chain_address/types"
import "../common/types"

/// @notice Family-agnostic message routed to a Receiver.
struct Any2TVMMessage {
    messageId: uint256;
    sourceChainSelector: uint64;
    sender: CrossChainAddress;
    data: cell;
    /// Tokens delivered to the receiver, with amounts in local token decimals.
    tokenAmounts: SnakedCell<TokenAmount>?;
}

type ReceiveExecutorId = uint192;
