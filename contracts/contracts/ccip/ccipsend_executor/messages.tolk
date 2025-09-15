import "../types"
import "storage"
import "../fee_quoter/messages"

tolk 1.0

// crc32('CCIPSendExecutor_Execute')
struct (0xAF3C62B3)CCIPSendExecutor_Execute {
    onrampSend: OnRampSend,
    config: Cell<CCIPSendExecutor_Config>,
    onrampJettonWallet: address? = null,
}

type CCIPSendExecutor_InMessage =
    | CCIPSendExecutor_Execute
    | FeeQuoter_MessageValidated<Metadata>
    | JettonTransferNotification
    // TODO Implement interrupt message that allows to cancel the pending CCIP send and return funds to the sender. This should be callable only after a certain timeout. 
