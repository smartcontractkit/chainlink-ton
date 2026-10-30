import "../../../../lib/utils"
import "../../cross_chain_address/types"
import "../common/types"
import "types"

// Answers with Router_CCIPReceive
struct (0x31768d95) Router_CCIPSend {
    queryID: uint64;
    destChainSelector: uint64;
    receiver: CrossChainAddress;
    data: cell;
    tokenAmounts: SnakedCell<TokenAmount>;
    feeToken: address?;
    extraArgs: Cell<ExtraArgs>;
}