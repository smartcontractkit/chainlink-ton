import { Cell, beginCell, Address, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import '@ton/test-utils'
import * as fs from 'fs'
import * as path from 'path'
import { bigIntToUint8Array } from '../../../src/utils'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import { ChainSelectors } from '../../utils/Selectors'
import generateMessageID, { getMetadataHash } from '../../../src/offramp/generateMessageID'
import { EVM_ONRAMP_ADDRESS_TEST, EVM_SENDER_ADDRESS_TEST } from './OffRamp.Setup'
import * as tmh from '../../../wrappers/gen/test/TestMsgHasher'

// Single source of truth for the expected MessageID of the fixed message below, shared
// with the Go implementation (cciplib/ccip/codec/msghasher_test.go).
const ANY2TVM_MESSAGE_ID_GOLDEN_PATH = path.join(
  __dirname,
  '../../../../testdata/golden/any2tvm_message_id.json',
)

function loadAny2TVMMessageIDGolden(): bigint {
  const golden = JSON.parse(fs.readFileSync(ANY2TVM_MESSAGE_ID_GOLDEN_PATH, 'utf-8')) as {
    messageId: string
  }
  return BigInt(golden.messageId)
}

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
      ChainSelectors.testnet.ton,
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

    const golden = loadAny2TVMMessageIDGolden()

    // Both the TypeScript and Tolk implementations must agree with each other, and
    // with the golden value also checked by cciplib/ccip/codec/msghasher_test.go
    expect(onChainMessageId).toBe(golden)
    expect(localMessageId).toBe(golden)
  })

  it('getMetadataHash matches the on-chain msg_hasher implementation', async () => {
    const sourceChainSelector = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001
    const destChainSelector = ChainSelectors.testnet.ton

    // Local TypeScript calculation, independent of the contract
    const localMetadataHash = getMetadataHash(
      sourceChainSelector,
      destChainSelector,
      EVM_ONRAMP_ADDRESS_TEST,
    )

    // On-chain calculation via the real Tolk implementation (msg_hasher.tolk wraps
    // Any2TVMMessageV1Metadata from ccip/offramp/types.tolk)
    const onChainMetadataHash = await msgHasher.getAny2TVMV1MetadataHash(
      sourceChainSelector,
      destChainSelector,
      EVM_ONRAMP_ADDRESS_TEST,
    )

    expect(onChainMetadataHash).toBe(localMetadataHash)
  })
})
