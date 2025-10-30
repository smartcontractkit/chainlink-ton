import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'
import '@ton/test-utils'

import {
  Receiver,
  ReceiverError,
  ReceiverStorage,
  ReceiverBehavior,
  CCIPReceive,
  builder as CCIPReceiveBuilder,
  RECEIVER_FACILITY_ID,
  RECEIVER_ERROR_CODE,
  UpdateAuthorizedCaller,
  UpdateBehavior,
} from '../../wrappers/ccip/Receiver'
import { builder as OffRampBuilder } from '../../wrappers/ccip/OffRamp'
import { assertLog } from '../Logs'
import * as CCIPLogs from '../../wrappers/ccip/Logs'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'

function generateSecureRandomId(): number {
  return Math.floor(Math.random() * 0x100000000) // 2^32
}

const ccipReceiveSampleMessage: CCIPReceive = {
  rootId: BigInt(1),
  message: {
    messageId: BigInt(1),
    sourceChainSelector: BigInt(2),
    sender: Buffer.from('cross chain address'),
    data: beginCell().storeBuffer(Buffer.from('cross chain data')).endCell(),
  },
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
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        authorizedCaller: deployer.address,
        behavior: ReceiverBehavior.Accept,
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
    const authorizedCaller = await receiver.getAuthorizedCaller()
    const facilityId = await receiver.getFacilityId()
    const errorCode = await receiver.getErrorCode(0)

    expect(id).toBeDefined()
    expect(authorizedCaller.toString()).toEqual(deployer.address.toString())
    expect(facilityId).toEqual(RECEIVER_FACILITY_ID)
    expect(errorCode).toEqual(RECEIVER_ERROR_CODE)
  })

  it('should emit an event when calling with the right sender', async () => {
    const result = await receiver.sendCCIPReceive(
      deployer.getSender(),
      toNano('1'),
      ccipReceiveSampleMessage,
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: true,
      deploy: false,
      body: CCIPReceiveBuilder.message.in.ccipReceive.encode(ccipReceiveSampleMessage).asCell(),
    })

    expect(result.transactions).toHaveTransaction({
      from: receiver.address,
      to: deployer.address,
      success: true,
      deploy: false,
      body: OffRampBuilder.message.in.ccipReceiveConfirm
        .encode({ rootId: ccipReceiveSampleMessage.rootId })
        .endCell(),
    })

    assertLog(
      result.transactions,
      receiver.address,
      CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
      {
        message: ccipReceiveSampleMessage.message,
      },
    )
  })

  it('should failed with unauthorized when calling ccipReceive with a different sender as the offramp address', async () => {
    const result = await receiver.sendCCIPReceive(
      unauthorized.getSender(),
      toNano('1'),
      ccipReceiveSampleMessage,
    )

    expect(result.transactions).toHaveTransaction({
      from: unauthorized.address,
      to: receiver.address,
      success: false,
      exitCode: ReceiverError.Unauthorized,
    })
  })

  it('should failed with OnlyCallableByOwner when trying to modify authorized caller without the owner', async () => {
    const updateAuthorizedCaller: UpdateAuthorizedCaller = {
      authorizedCaller: deployer.address,
    }

    const result = await receiver.sendUpdateAuthorizedCaller(
      unauthorized.getSender(),
      toNano('1'),
      updateAuthorizedCaller,
    )

    expect(result.transactions).toHaveTransaction({
      from: unauthorized.address,
      to: receiver.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })
  })

  it('should failed with OnlyCallableByOwner when trying to modify behavior without the owner', async () => {
    const updateBehavior: UpdateBehavior = {
      behavior: ReceiverBehavior.RejectAll,
    }

    const result = await receiver.sendUpdateBehavior(
      unauthorized.getSender(),
      toNano('1'),
      updateBehavior,
    )

    expect(result.transactions).toHaveTransaction({
      from: unauthorized.address,
      to: receiver.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })
  })

  it('should always fail gracefully when updating the behavior to fail gracefully', async () => {
    const updateBehaviorToFailGracefully: UpdateBehavior = {
      behavior: ReceiverBehavior.RejectAll,
    }

    const updateBehaviorResult = await receiver.sendUpdateBehavior(
      deployer.getSender(),
      toNano('1'),
      updateBehaviorToFailGracefully,
    )

    expect(updateBehaviorResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: true,
      deploy: false,
      body: CCIPReceiveBuilder.message.in.updateBehavior
        .encode(updateBehaviorToFailGracefully)
        .asCell(),
    })

    const newBehavior = await receiver.getBehavior()
    expect(newBehavior).toEqual(ReceiverBehavior.RejectAll)

    // Send new ccipReceive expecting to bounce
    const result = await receiver.sendCCIPReceive(
      deployer.getSender(),
      toNano('1'),
      ccipReceiveSampleMessage,
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: false,
      aborted: true,
      exitCode: ReceiverError.ReceiverIsConfigureToFailGracefully,
    })
  })

  it('should fail consuming all gas from transaction when updating the behavior to consume all gas', async () => {
    const updateBehaviorToConsumeAllGas: UpdateBehavior = {
      behavior: ReceiverBehavior.ConsumeAllGas,
    }

    const updateBehaviorResult = await receiver.sendUpdateBehavior(
      deployer.getSender(),
      toNano('1'),
      updateBehaviorToConsumeAllGas,
    )

    expect(updateBehaviorResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: true,
      deploy: false,
      body: CCIPReceiveBuilder.message.in.updateBehavior
        .encode(updateBehaviorToConsumeAllGas)
        .asCell(),
    })

    const newBehavior = await receiver.getBehavior()
    expect(newBehavior).toEqual(ReceiverBehavior.ConsumeAllGas)

    // Send new ccipReceive expecting to run out of gas
    const result = await receiver.sendCCIPReceive(
      deployer.getSender(),
      toNano('1'),
      ccipReceiveSampleMessage,
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: false,
      aborted: true,
      exitCode: -14,
    })
  })
})
