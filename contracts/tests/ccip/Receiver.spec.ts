import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'
import '@ton/test-utils'

import { generateRandomContractId } from '../../src/utils'
import { facilityId } from '../../wrappers/utils'
import { crc32 } from 'zlib'

import * as r from '../../wrappers/libraries/Receiver'
import * as tr from '../../wrappers/examples/Receiver'
import * as rt from '../../wrappers/ccip/Router'
import { assertLog } from '../Logs'
import * as CCIPLogs from '../../wrappers/ccip/Logs'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'
import * as UpgradeableSpec from '../lib/versioning/UpgradeableSpec'

async function deployReceiverContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
) {
  const code = await tr.Receiver.code()
  let data: tr.Storage = {
    id: generateRandomContractId(),
    ownable: {
      owner: owner.address,
      pendingOwner: null,
    },
    authorizedCaller: owner.address,
    behavior: tr.ReceiverBehavior.Accept,
  }

  const contract = blockchain.openContract(tr.Receiver.createFromConfig(data, code))
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
  return contract
}

const ccipReceiveSampleMessage: r.CCIPReceive = {
  rootId: BigInt(1),
  message: {
    messageId: BigInt(1),
    sourceChainSelector: BigInt(2),
    sender: Buffer.from('cross chain address'),
    data: beginCell().storeBuffer(Buffer.from('cross chain data')).endCell(),
  },
}

describe('Receiver - FacilityID', () => {
  it('Test facilityId matches facility name', () => {
    expect(r.FACILITY_ID).toEqual(facilityId(crc32(r.FACILITY_NAME)))
    expect(tr.FACILITY_ID).toEqual(facilityId(crc32(tr.FACILITY_NAME)))
  })
})

describe('Receiver - Opcodes', () => {
  it('should match in opcodes', () => {
    expect(r.opcodes.in.ccipReceive).toBe(crc32('Receiver_CCIPReceive'))
    expect(tr.opcodes.in.updateBehavior).toBe(crc32('TestReceiver_UpdateBehavior'))
    expect(tr.opcodes.in.updateAuthorizedCaller).toBe(crc32('TestReceiver_UpdateAuthorizedCaller'))
  })
})

describe('Receiver - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: tr.Receiver.type(),
    currentVersion: tr.Receiver.version(),
    getCurrentCode: () => tr.Receiver.code(),
    CurrentVersionConstructor: tr.Receiver,
    deployCurrentContract: deployReceiverContract,
  })
  currentVersionSpec.run()
})

describe('Receiver', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let unauthorized: SandboxContract<TreasuryContract>
  let receiver: SandboxContract<tr.Receiver>

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
      let data: tr.Storage = {
        id: generateRandomContractId(),
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        authorizedCaller: deployer.address,
        behavior: tr.ReceiverBehavior.Accept,
      }

      receiver = blockchain.openContract(tr.Receiver.createFromConfig(data, code))

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
    const errorCode = await receiver.getErrorCode(0n)

    expect(id).toBeDefined()
    expect(authorizedCaller.toString()).toEqual(deployer.address.toString())
    expect(facilityId).toEqual(BigInt(tr.FACILITY_ID))
    expect(errorCode).toEqual(BigInt(tr.ERROR_CODE))
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
      body: tr.builder.message.in.ccipReceive.encode(ccipReceiveSampleMessage).asCell(),
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

  it('should failed with unauthorized when calling ccipReceive with a different sender as the router address', async () => {
    const result = await receiver.sendCCIPReceive(
      unauthorized.getSender(),
      toNano('1'),
      ccipReceiveSampleMessage,
    )

    expect(result.transactions).toHaveTransaction({
      from: unauthorized.address,
      to: receiver.address,
      success: false,
      exitCode: tr.error.Unauthorized,
    })
  })

  it('should failed with OnlyCallableByOwner when trying to modify authorized caller without the owner', async () => {
    const updateAuthorizedCaller: tr.UpdateAuthorizedCaller = {
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
    const updateBehavior: tr.UpdateBehavior = {
      behavior: tr.ReceiverBehavior.RejectAll,
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
    const updateBehaviorToFailGracefully: tr.UpdateBehavior = {
      behavior: tr.ReceiverBehavior.RejectAll,
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
      body: tr.builder.message.in.updateBehavior.encode(updateBehaviorToFailGracefully).asCell(),
    })

    const newBehavior = await receiver.getBehavior()
    expect(newBehavior).toEqual(tr.ReceiverBehavior.RejectAll)

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
      exitCode: tr.error.Rejected,
    })
  })

  it('should fail consuming all gas from transaction when updating the behavior to consume all gas', async () => {
    const updateBehaviorToConsumeAllGas: tr.UpdateBehavior = {
      behavior: tr.ReceiverBehavior.ConsumeAllGas,
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
      body: tr.builder.message.in.updateBehavior.encode(updateBehaviorToConsumeAllGas).asCell(),
    })

    const newBehavior = await receiver.getBehavior()
    expect(newBehavior).toEqual(tr.ReceiverBehavior.ConsumeAllGas)

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

  it('should keep original balance after succesfully receiving', async () => {
    const contract = await blockchain.getContract(receiver.address)
    const initialBalance = contract.balance

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
      body: tr.builder.message.in.ccipReceive.encode(ccipReceiveSampleMessage).asCell(),
    })

    const tx = result.transactions.find(
      (tx) =>
        tx.inMessage &&
        tx.inMessage.info.src &&
        tx.inMessage.info.src instanceof Address &&
        tx.inMessage.info.src.equals(deployer.address) &&
        tx.inMessage.info.dest &&
        tx.inMessage.info.dest instanceof Address &&
        tx.inMessage.info.dest.equals(receiver.address),
    )
    if (!tx || tx.description.type != 'generic') {
      throw new Error('Expected an internal message')
    }
    const storageFees = tx.description.storagePhase?.storageFeesCollected || toNano('0')

    const finalBalance = (await blockchain.getContract(receiver.address)).balance
    expect(finalBalance).toEqual(initialBalance - storageFees)
  })
})
