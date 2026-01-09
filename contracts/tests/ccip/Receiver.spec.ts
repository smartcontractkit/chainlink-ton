import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'
import '@ton/test-utils'

import * as rx from '../../wrappers/ccip/Receiver'
import * as rt from '../../wrappers/ccip/Router'
import { assertLog } from '../Logs'
import * as CCIPLogs from '../../wrappers/ccip/Logs'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'
import { generateRandomContractId } from '../../src/utils'
import { errorCode, facilityId } from '../../wrappers/utils'
import { crc32 } from 'zlib'

const ccipReceiveSampleMessage: rx.CCIPReceive = {
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
  let receiver: SandboxContract<rx.Receiver>

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
      let data: rx.ReceiverStorage = {
        id: generateRandomContractId(),
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        authorizedCaller: deployer.address,
        behavior: rx.ReceiverBehavior.Accept,
      }

      receiver = blockchain.openContract(rx.Receiver.createFromConfig(data, code))

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

    expect(id).toBeDefined()
    expect(authorizedCaller.toString()).toEqual(deployer.address.toString())
  })

  it('should match facility name and ID', async () => {
    const facilityIdVal = await receiver.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(rx.FACILITY_ID))

    const { type } = await receiver.getTypeAndVersion()
    expect(type).toBe(rx.FACILITY_NAME)

    expect(rx.FACILITY_ID).toEqual(facilityId(crc32(rx.FACILITY_NAME)))
  })

  it('should match error code', async () => {
    const errorCodeVal = await receiver.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(rx.ERROR_CODE))

    expect(rx.ERROR_CODE).toEqual(errorCode(crc32(rx.FACILITY_NAME), 0))
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
      body: rx.builder.message.in.ccipReceive.encode(ccipReceiveSampleMessage).asCell(),
    })

    expect(result.transactions).toHaveTransaction({
      from: receiver.address,
      to: deployer.address,
      success: true,
      deploy: false,
      body: rt.builder.message.in.ccipReceiveConfirm
        .encode({ execID: ccipReceiveSampleMessage.rootId })
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
      exitCode: rx.ReceiverError.Unauthorized,
    })
  })

  it('should failed with OnlyCallableByOwner when trying to modify authorized caller without the owner', async () => {
    const updateAuthorizedCaller: rx.UpdateAuthorizedCaller = {
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
    const updateBehavior: rx.UpdateBehavior = {
      behavior: rx.ReceiverBehavior.RejectAll,
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
    const updateBehaviorToFailGracefully: rx.UpdateBehavior = {
      behavior: rx.ReceiverBehavior.RejectAll,
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
      body: rx.builder.message.in.updateBehavior.encode(updateBehaviorToFailGracefully).asCell(),
    })

    const newBehavior = await receiver.getBehavior()
    expect(newBehavior).toEqual(rx.ReceiverBehavior.RejectAll)

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
      exitCode: rx.ReceiverError.ReceiverIsConfigureToFailGracefully,
    })
  })

  it('should fail consuming all gas from transaction when updating the behavior to consume all gas', async () => {
    const updateBehaviorToConsumeAllGas: rx.UpdateBehavior = {
      behavior: rx.ReceiverBehavior.ConsumeAllGas,
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
      body: rx.builder.message.in.updateBehavior.encode(updateBehaviorToConsumeAllGas).asCell(),
    })

    const newBehavior = await receiver.getBehavior()
    expect(newBehavior).toEqual(rx.ReceiverBehavior.ConsumeAllGas)

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
