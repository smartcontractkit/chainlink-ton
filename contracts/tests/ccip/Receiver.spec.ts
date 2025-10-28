import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'
import '@ton/test-utils'

import {
  Receiver,
  ReceiverError,
  ReceiverStorage,
  CCIPReceive,
  builder as CCIPReceiveBuilder,
  RECEIVER_FACILITY_ID,
  RECEIVER_ERROR_CODE,
} from '../../wrappers/ccip/Receiver'
import { builder as OffRampBuilder } from '../../wrappers/ccip/OffRamp'
import { assertLog } from '../Logs'
import * as CCIPLogs from '../../wrappers/ccip/Logs'

function generateSecureRandomId(): number {
  return Math.floor(Math.random() * 0x100000000) // 2^32
}

describe('Receiver', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let unauthorized: SandboxContract<TreasuryContract>
  let receiver: SandboxContract<Receiver>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    unauthorized = await blockchain.treasury('unauthorized')
  })

  beforeEach(async () => {
    // setup offramp
    {
      let code = await compile('ccip.test.receiver')

      // Use a library reference
      let data: ReceiverStorage = {
        id: generateSecureRandomId(),
        offramp: deployer.address,
        rejectAll: false,
      }

      receiver = blockchain.openContract(Receiver.createFromConfig(data, code))

      let result = await receiver.sendDeploy(deployer.getSender(), toNano('10'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiver.address,
        deploy: true,
        success: true,
      })
    }
  }, 60_000) // setup can take a while, since we deploy contracts

  it('should deploy', async () => {
    // the check is done inside beforeEach
  })

  it('should have the right storage', async () => {
    const id = await receiver.getId()
    const offrampAddress = await receiver.getOffRampAddress()
    const facilityId = await receiver.getFacilityId()
    const errorCode = await receiver.getErrorCode(0)

    expect(id).toBeDefined()
    expect(offrampAddress.toString()).toEqual(deployer.address.toString())
    expect(facilityId).toEqual(RECEIVER_FACILITY_ID)
    expect(errorCode).toEqual(RECEIVER_ERROR_CODE)
  })

  it('should emit an event when calling with the right sender', async () => {
    const ccipReceive: CCIPReceive = {
      rootId: BigInt(1),
      message: {
        messageId: BigInt(1),
        sourceChainSelector: BigInt(2),
        sender: Buffer.from('cross chain address'),
        data: beginCell().storeBuffer(Buffer.from('cross chain data')).endCell(),
      },
    }

    const result = await receiver.sendCCIPReceive(deployer.getSender(), toNano('1'), ccipReceive)

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: true,
      deploy: false,
      body: CCIPReceiveBuilder.message.in.ccipReceive.encode(ccipReceive).asCell(),
    })

    expect(result.transactions).toHaveTransaction({
      from: receiver.address,
      to: deployer.address,
      success: true,
      deploy: false,
      body: OffRampBuilder.message.in.ccipReceiveConfirm
        .encode({ rootId: ccipReceive.rootId })
        .endCell(),
    })

    assertLog(
      result.transactions,
      receiver.address,
      CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
      {
        message: ccipReceive.message,
      },
    )
  })

  it('should failed with unauthorized when calling ccipReceive with a different sender as the offramp address', async () => {
    const ccipReceive: CCIPReceive = {
      rootId: BigInt(1),
      message: {
        messageId: BigInt(1),
        sourceChainSelector: BigInt(2),
        sender: Buffer.from('cross chain address'),
        data: beginCell().storeBuffer(Buffer.from('cross chain data')).endCell(),
      },
    }

    const result = await receiver.sendCCIPReceive(
      unauthorized.getSender(),
      toNano('1'),
      ccipReceive,
    )

    expect(result.transactions).toHaveTransaction({
      from: unauthorized.address,
      to: receiver.address,
      success: false,
      exitCode: ReceiverError.Unauthorized,
    })
  })
})
