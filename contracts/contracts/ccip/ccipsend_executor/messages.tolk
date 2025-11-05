import "types"
import "storage"
import "../../lib/versioning/upgradeable"

import "../common/messages"
import "../onramp/messages"
import "../router/messages"
import "../onramp/types"

type CCIPSendExecutor_InMessage =
    | CCIPSendExecutor_Execute
    | CCIPSendExecutor_MessageValidated<Metadata>
    | CCIPSendExecutor_MessageValidationFailed<Metadata>
    | Common_JettonTransferNotification
    // TODO | TokenRegistry_TokenPoolInfo
    // TODO Implement interrupt message that allows to cancel the pending CCIP send and return funds to the sender. This should be callable only after a certain timeout. 

// crc32('CCIPSendExecutor_Execute')
struct (0xaf3c62b3) CCIPSendExecutor_Execute {
    onrampSend: OnRamp_Send,
    config: Cell<CCIPSendExecutor_Config>,
    onrampJettonWallet: address? = null,
}

// crc32('CCIPSendExecutor_MessageValidated')
struct (0xcbc4af76) CCIPSendExecutor_MessageValidated<C> {
    msg: Cell<Router_CCIPSend>
    metadata: Cell<C>
    fee: coins
}

// crc32('CCIPSendExecutor_MessageValidationFailed')
struct (0x0f756150) CCIPSendExecutor_MessageValidationFailed<C> {
    msg: Cell<Router_CCIPSend>,
    metadata: Cell<C>,
    error: uint256,
}



