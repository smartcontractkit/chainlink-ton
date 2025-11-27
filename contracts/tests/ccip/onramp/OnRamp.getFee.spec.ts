import * as or from '../../../wrappers/ccip/OnRamp'
import * as rt from '../../../wrappers/ccip/Router'
import * as fq from '../../../wrappers/ccip/FeeQuoter'

import { Address, beginCell, Cell, Message, toNano } from '@ton/core'
import { generateRandomTonAddress, ZERO_ADDRESS } from '../../../src/utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import {
  CHAINSEL_EVM_TEST,
  CHAINSEL_EVM_TEST_90000002,
  deployOnRampContract,
  setup,
} from './OnRamp.Setup'
import { dump } from '../../utils/prettyPrint'

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
) // 32 bytes
const TEST_TOKEN_ADDR = Address.parseRaw(
  '0:0000000000000000000000000000000000000000000000000000000000000000',
)

describe('OnRamp - Get Fee', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let feeQuoterAddr: Address

  const ccipSend: rt.CCIPSend = {
    queryID: 1,
    destChainSelector: CHAINSEL_EVM_TEST_90000002,
    receiver: EVM_ADDRESS,
    data: Cell.EMPTY,
    tokenAmounts: [],
    feeToken: TEST_TOKEN_ADDR,
    extraArgs: rt.builder.data.extraArgs
      .encode({
        kind: 'generic-v2',
        gasLimit: 100n,
        allowOutOfOrderExecution: true,
      })
      .asCell(),
  }

  beforeEach(async () => {
    ;({ blockchain, deployer } = await setup())
    feeQuoterAddr = await generateRandomTonAddress()

    onramp = await deployOnRampContract(blockchain, deployer, {
      config: {
        feeQuoter: feeQuoterAddr, // For now, fee quoter is global
      },
    })
  })

  it('should get feequoter offchain', async () => {
    // This is required to get fee off-chain
    // 1. get onramp address from router
    // 2. get fee quoter address from onramp <=
    // 3. get validated fee from fee quoter

    const queriedFeeQuoter = await onramp.getFeeQuoter(CHAINSEL_EVM_TEST_90000002) // We don't validate chain selector here yet. We might enable different fee quoters per chain later.
    expect(queriedFeeQuoter.equals(feeQuoterAddr)).toBe(true)
  })

  it('should forward get fee to fee quoter', async () => {
    const result = await onramp.sendGetValidatedFee(deployer.getSender(), {
      value: toNano('0.5'),
      msg: ccipSend,
      context: beginCell().storeUint(42, 32).endCell(), // arbitrary context
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
      op: or.Opcodes.getValidatedFee,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: feeQuoterAddr,
      success: false,
      op: fq.Opcodes.getValidatedFee,
    })

    const tx = result.transactions.find(
      (tx) =>
        tx.inMessage &&
        tx.inMessage.info.src instanceof Address &&
        tx.inMessage.info.src.equals(deployer.address) &&
        tx.inMessage.info.dest instanceof Address &&
        tx.inMessage.info.dest.equals(onramp.address),
    )
    if (!tx) {
      throw new Error('Cannot find outgoing message from OnRamp to FeeQuoter')
    }
    if (tx.outMessages.values().length !== 1) {
      throw new Error('Unexpected number of out messages: ' + tx.outMessages.values().length)
    }
    const outMsg: Message = tx.outMessages.values()[0]
    if (outMsg.info.type !== 'internal') {
      throw new Error('Unexpected message type')
    }
    expect(outMsg.body.beginParse().loadUint(32)).toBe(fq.Opcodes.getValidatedFee)
    const decoded = fq.builder.message.in.getValidatedFee.load(outMsg.body.beginParse())
    expect(decoded.msg).toEqual(ccipSend)
  })
})
