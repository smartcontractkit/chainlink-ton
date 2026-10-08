import { Cell, beginCell, Address, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import '@ton/test-utils'
import * as fs from 'fs'
import * as path from 'path'
import { bigIntToUint8Array } from '../../../src/utils'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import { ChainSelectors } from '../../utils/Selectors'
import generateMessageID, { getMetadataHash } from '../../../src/offramp/generateMessageID'
import { EVM_ONRAMP_ADDRESS_TEST, EVM_SENDER_ADDRESS_TEST } from './OffRamp.Setup'
import * as tmh from '../../../wrappers/gen/test/TestMsgHasher'

// Single source of truth for the expected MessageIDs of the fixed messages below, shared
// with the Go implementation (cciplib/ccip/codec/msghasher_test.go). Golden values are
// anchored to the TypeScript/Tolk implementations, which match the on-chain OffRamp leaf
// recomputation from the execute report.
const ANY2TVM_MESSAGE_ID_GOLDEN_PATH = path.join(
  __dirname,
  '../../../../testdata/golden/any2tvm_message_id.json',
)

interface GoldenTokenTransfer {
  sourcePoolAddress: string
  token: string
  destGasAmount: string
  extraData: string | null
  amount: string
}

interface GoldenCase {
  name: string
  message: {
    header: {
      messageId: string
      sourceChainSelector: string
      destChainSelector: string
      sequenceNumber: string
      nonce: string
      onRamp: string
    }
    sender: string
    data: string
    receiver: string
    gasLimit: string
    tokenAmounts: GoldenTokenTransfer[] | null
  }
  expectedMessageId: string
}

function loadAny2TVMMessageIDGoldenCases(): GoldenCase[] {
  const golden = JSON.parse(fs.readFileSync(ANY2TVM_MESSAGE_ID_GOLDEN_PATH, 'utf-8')) as {
    cases: GoldenCase[]
  }
  return golden.cases
}

// 0x-prefixed hex -> Buffer
function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex.replace(/^0x/, ''), 'hex')
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

  it('generateMessageId matches the on-chain msg_hasher implementation and the Go implementation for all golden cases', async () => {
    for (const goldenCase of loadAny2TVMMessageIDGoldenCases()) {
      const msg = goldenCase.message
      const header = msg.header

      // Create the same message as in the Go test for cross-language compatibility
      const rampMessageHeader = of.RampMessageHeader.create({
        messageId: BigInt(header.messageId),
        sourceChainSelector: BigInt(header.sourceChainSelector),
        destChainSelector: BigInt(header.destChainSelector),
        sequenceNumber: BigInt(header.sequenceNumber),
        nonce: BigInt(header.nonce),
      })

      const tokenAmounts = msg.tokenAmounts
        ? msg.tokenAmounts.map((tt) =>
            of.Any2TVMTokenTransfer.create({
              sourcePoolAddress: CrossChainAddressCodec.FromBuffer(
                hexToBuffer(tt.sourcePoolAddress),
              ),
              token: Address.parse(tt.token),
              destGasAmount: BigInt(tt.destGasAmount),
              // null extraData serializes as Maybe=0, matching the on-chain `cell?`
              // and the Go execute codec's nil cell for empty destPoolData.
              extraData:
                tt.extraData === null
                  ? null
                  : beginCell().storeBuffer(hexToBuffer(tt.extraData)).endCell(),
              amount: BigInt(tt.amount),
            }),
          )
        : null

      const message = of.Any2TVMRampMessage.create({
        header: rampMessageHeader,
        sender: EVM_SENDER_ADDRESS_TEST,
        data: Cell.EMPTY,
        receiver: Address.parse(msg.receiver),
        gasLimit: BigInt(msg.gasLimit),
        tokenAmounts,
      })

      const metadataHash = getMetadataHash(
        BigInt(header.sourceChainSelector),
        BigInt(header.destChainSelector),
        EVM_ONRAMP_ADDRESS_TEST,
      )

      // Local TypeScript calculation, independent of the contract
      const localMessageId = generateMessageID(message, metadataHash)

      // On-chain calculation via the real Tolk implementation (msg_hasher.tolk wraps
      // Any2TVMRampMessage.generateMessageId from ccip/offramp/types.tolk)
      const onChainMessage = tmh.Any2TVMRampMessage.create({
        header: tmh.RampMessageHeader.create(rampMessageHeader),
        sender: tmh.CrossChainAddress.fromSlice(
          of.CrossChainAddress.toCell(message.sender).beginParse(),
        ),
        data: message.data,
        receiver: message.receiver,
        gasLimit: message.gasLimit,
        tokenAmounts: tokenAmounts
          ? tokenAmounts.map((tt) =>
              tmh.Any2TVMTokenTransfer.create({
                sourcePoolAddress: tmh.CrossChainAddress.fromSlice(
                  of.CrossChainAddress.toCell(tt.sourcePoolAddress).beginParse(),
                ),
                token: tt.token,
                destGasAmount: tt.destGasAmount,
                extraData: tt.extraData,
                amount: tt.amount,
              }),
            )
          : null,
      })
      const onChainMessageId = await msgHasher.getAny2TVMRampMessageID(onChainMessage, metadataHash)

      const expected = BigInt(goldenCase.expectedMessageId)

      // Both the TypeScript and Tolk implementations must agree with each other, and
      // with the golden value also checked by cciplib/ccip/codec/msghasher_test.go
      expect(onChainMessageId).toBe(expected)
      expect(localMessageId).toBe(expected)
    }
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
