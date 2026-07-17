import { Cell, beginCell, Address } from '@ton/core'
import { uint8ArrayToBigInt, bigIntToUint8Array } from '../../../src/utils'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import { ChainSelectors } from '../../utils/Selectors'
import generateMessageID, { getMetadataHash } from '../../../src/offramp/generateMessageID'
import { EVM_ONRAMP_ADDRESS_TEST, EVM_SENDER_ADDRESS_TEST } from './OffRamp.commitAndExec.spec'

describe('OffRamp - Message ID', () => {
  it('Test generateMessageId hash compatibility with Go', () => {
    // Create the exact same message as in Go test for cross-language compatibility
    const rampMessageHeader = of.RampMessageHeader.create({
      messageId: 1n,
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      destChainSelector: ChainSelectors.testnet.ton,
      sequenceNumber: 1n,
      nonce: 0n,
    })

    const message = of.Any2TVMRampMessage.create({
      header: rampMessageHeader,
      sender: beginCell()
        .storeBuffer(Buffer.from(bigIntToUint8Array(EVM_SENDER_ADDRESS_TEST)))
        .asSlice(),
      data: Cell.EMPTY,
      receiver: Address.parse('EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2'),
      gasLimit: 100000000n,
      tokenAmounts: null,
    })

    const metadataHash = uint8ArrayToBigInt(
      getMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        EVM_ONRAMP_ADDRESS_TEST,
      ),
    )
    const messageIdHash = generateMessageID(message, metadataHash)
    const messageId = uint8ArrayToBigInt(messageIdHash)

    // Uncomment to log the hash to update Go test
    // const hashHex = messageId.toString(16).padStart(64, '0')
    // console.log('Expected hash for Go test:', hashHex)
    // Basic validation that we got a valid hash
    expect(messageId).toBe(0xba590969e3987ddf666a8319d7269b64f29da09636a8e996dac78309a2f76807n)

    // Uncomment to log the raw bytes of ramp message for Go test
    // console.log(beginCell().storeBuilder(or.Any2TVMRampMessageToBuilder(message)).endCell().toBoc().toString('hex'))
    // Uncomment to log the raw bytes of execute report for Go test
    // const report = createExecuteReport([message])
    // console.log(beginCell().storeBuilder(or.ExecutionReportToBuilder(report)).endCell().toBoc().toString('hex'))
  })
})
