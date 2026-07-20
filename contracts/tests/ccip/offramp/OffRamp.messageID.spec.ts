import { Cell, beginCell, Address, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import '@ton/test-utils'
import { uint8ArrayToBigInt, bigIntToUint8Array } from '../../../src/utils'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import { ChainSelectors } from '../../utils/Selectors'
import generateMessageID, { getMetadataHash } from '../../../src/offramp/generateMessageID'
import { EVM_ONRAMP_ADDRESS_TEST, EVM_SENDER_ADDRESS_TEST } from './OffRamp.commitAndExec.spec'
import * as tmh from '../../../wrappers/gen/test/TestMsgHasher'

describe('OffRamp - Message ID', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let msgHasher: SandboxContract<tmh.TestMsgHasher>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')

    msgHasher = blockchain.openContract(tmh.TestMsgHasher.fromStorage({}))
    const result = await msgHasher.sendDeploy(deployer.getSender(), toNano('0.2'))
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: msgHasher.address,
      deploy: true,
      success: true,
    })
  })

  it('generateMessageId matches the on-chain msg_hasher implementation and the Go implementation', async () => {
    // Create the exact same message as in the Go test for cross-language compatibility
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

    const metadataHash = getMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      EVM_ONRAMP_ADDRESS_TEST,
    )

    // Local TypeScript calculation, independent of the contract
    const localMessageId = generateMessageID(message, metadataHash)

    // On-chain calculation via the real Tolk implementation (msg_hasher.tolk wraps
    // Any2TVMRampMessage.generateMessageId from ccip/offramp/types.tolk)
    const onChainMessage = tmh.Any2TVMRampMessage.create({
      header: tmh.RampMessageHeader.create(rampMessageHeader),
      sender: message.sender,
      data: message.data,
      receiver: message.receiver,
      gasLimit: message.gasLimit,
      tokenAmounts: null,
    })
    const onChainMessageId = await msgHasher.getAny2TVMRampMessageID(onChainMessage, metadataHash)

    expect(onChainMessageId).toBe(localMessageId)

    // Cross-language compatibility check against cciplib/ccip/codec/msghasher_test.go
    expect(localMessageId).toBe(0xba590969e3987ddf666a8319d7269b64f29da09636a8e996dac78309a2f76807n)
  })
})
