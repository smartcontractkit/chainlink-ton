import "../types"
import "storage"
import "../fee_quoter/messages"

tolk 1.1

// crc32('CCIPSendExecutor_Execute')
struct (0xAF3C62B3)CCIPSendExecutor_Execute {
    onrampSend: OnRampSend,
    config: CCIPSendExecutor_Config,
}

type CCIPSendExecutor_InMessage =
    | CCIPSendExecutor_Execute
    | FeeQuoter_MessageValidated<Metadata>
    // TODO Implement interrupt message that allows to cancel the pending CCIP send and return funds to the sender. This should be callable only after a certain timeout. 

// TODO return deployed confirmation to OnRamp