import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import '@ton/test-utils'

import { generateRandomContractId } from '../../src/utils'
import { facilityId } from '../../wrappers/utils'
import { crc32 } from 'zlib'
import { contractCode } from '../../wrappers/codeLoader'

import * as r from '../../wrappers/gen/ccip/Receiver'
import * as trMan from '../../wrappers/examples/Receiver'
import * as tr from '../../wrappers/gen/ccip/TestReceiver'
import * as rt from '../../wrappers/gen/ccip/Router'
import { assertLog } from '../Logs'
import * as CCIPLogs from '../../wrappers/ccip/Logs'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'
import * as UpgradeableSpec from '../lib/versioning/UpgradeableSpec'
import EVM_ADDRESS from '../utils/evmAddress'

async function deployReceiverContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  codeOverride?: Cell,
) {
  const code = codeOverride ?? (await contractCode.ccip.local('ccip.test.receiver'))
  let data = tr.Storage.create({
    id: generateRandomContractId(),
    ownable: tr.Ownable2Step.create({
      owner: owner.address,
    }),
    authorizedCaller: owner.address,
    behavior: tr.TestReceiver_Behavior.Accept,
  })

  const contract = blockchain.openContract(
    tr.TestReceiver.fromStorage(data, { overrideContractCode: code }),
  )
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
  return contract
}

const ccipReceiveSampleMessage = r.CCIPReceive.create({
  execId: 1n,
  message: rt.Any2TVMMessage.create({
    messageId: 1n,
    sourceChainSelector: 2n,
    sender: EVM_ADDRESS,
    data: beginCell().storeBuffer(Buffer.from('cross chain data')).endCell(),
    tokenAmounts: null,
  }),
})

describe('Receiver - FacilityID', () => {
  it('Test facilityId matches facility name', () => {
    expect(trMan.FACILITY_ID).toEqual(facilityId(crc32(trMan.FACILITY_NAME)))
  })
})

describe('Receiver - Opcodes', () => {
  it('should match in opcodes', () => {
    expect(trMan.opcodes.in.updateBehavior).toBe(crc32('TestReceiver_UpdateBehavior'))
    expect(trMan.opcodes.in.updateAuthorizedCaller).toBe(
      crc32('TestReceiver_UpdateAuthorizedCaller'),
    )
  })
})

describe('Receiver - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: trMan.FACILITY_NAME,
    currentVersion: trMan.CONTRACT_VERSION,
    getCurrentCode: () => contractCode.ccip.local('ccip.test.receiver'),
    CurrentVersionConstructor: tr.TestReceiver.fromAddress,
    deployCurrentContract: deployReceiverContract,
  })
  currentVersionSpec.run()
})

describe('Receiver - Upgrade Tests', () => {
  const upgradeSpec = UpgradeableSpec.newUpgradeSpec({
    contractType: trMan.FACILITY_NAME,
    prevVersionConfigs: Object.entries(trMan.SUPPORTED_PREV_VERSIONS).map(([version, getCode]) => ({
      version,
      getCode,
      deploy: async (blockchain: Blockchain, owner: SandboxContract<TreasuryContract>) =>
        deployReceiverContract(blockchain, owner, await getCode()),
    })),
    currentVersion: trMan.CONTRACT_VERSION,
    getCurrentCode: () => contractCode.ccip.local('ccip.test.receiver'),
    CurrentVersionConstructor: tr.TestReceiver.fromAddress,
    upgradeValue: toNano('0.05'),
  })
  upgradeSpec.run()
})

describe('Receiver', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let unauthorized: SandboxContract<TreasuryContract>
  let receiver: SandboxContract<tr.TestReceiver>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    unauthorized = await blockchain.treasury('unauthorized')
  })

  beforeEach(async () => {
    // setup offramp
    {
      let code = await contractCode.ccip.local('ccip.test.receiver')

      // Use a library reference
      let data = tr.Storage.create({
        id: generateRandomContractId(),
        ownable: tr.Ownable2Step.create({
          owner: deployer.address,
        }),
        authorizedCaller: deployer.address,
        behavior: tr.TestReceiver_Behavior.Accept,
      })

      receiver = blockchain.openContract(
        tr.TestReceiver.fromStorage(data, { overrideContractCode: code }),
      )

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
    expect(authorizedCaller).toEqual(deployer.address)
    expect(facilityId).toEqual(BigInt(trMan.FACILITY_ID))
    expect(errorCode).toEqual(BigInt(trMan.ERROR_CODE))
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
      body: r.CCIPReceive.toCell(ccipReceiveSampleMessage),
    })

    expect(result.transactions).toHaveTransaction({
      from: receiver.address,
      to: deployer.address,
      success: true,
      deploy: false,
      body: rt.Router_CCIPReceiveConfirm.toCell(
        rt.Router_CCIPReceiveConfirm.create({ execId: ccipReceiveSampleMessage.execId }),
      ),
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
      exitCode: tr.TestReceiver.Errors['Receiver_Error.Unauthorized'],
    })
  })

  it('should failed with OnlyCallableByOwner when trying to modify authorized caller without the owner', async () => {
    const updateAuthorizedCaller = tr.TestReceiver_UpdateAuthorizedCaller.create({
      authorizedCaller: deployer.address,
    })

    const result = await receiver.sendTestReceiverUpdateAuthorizedCaller(
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
    const updateBehavior = tr.TestReceiver_UpdateBehavior.create({
      behavior: tr.TestReceiver_Behavior.RejectAll,
    })

    const result = await receiver.sendTestReceiverUpdateBehavior(
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
    const updateBehaviorToFailGracefully = tr.TestReceiver_UpdateBehavior.create({
      behavior: tr.TestReceiver_Behavior.RejectAll,
    })

    const updateBehaviorResult = await receiver.sendTestReceiverUpdateBehavior(
      deployer.getSender(),
      toNano('1'),
      updateBehaviorToFailGracefully,
    )

    expect(updateBehaviorResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: true,
      deploy: false,
      body: tr.TestReceiver_UpdateBehavior.toCell(updateBehaviorToFailGracefully),
    })

    const newBehavior = await receiver.getBehavior()
    expect(newBehavior).toEqual(tr.TestReceiver_Behavior.RejectAll)

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
      exitCode: tr.TestReceiver.Errors['TestReceiver_Error.Rejected'],
    })
  })

  it('should fail consuming all gas from transaction when updating the behavior to consume all gas', async () => {
    const updateBehaviorToConsumeAllGas = tr.TestReceiver_UpdateBehavior.create({
      behavior: tr.TestReceiver_Behavior.ConsumeAllGas,
    })

    const updateBehaviorResult = await receiver.sendTestReceiverUpdateBehavior(
      deployer.getSender(),
      toNano('1'),
      updateBehaviorToConsumeAllGas,
    )

    expect(updateBehaviorResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: true,
      deploy: false,
      body: tr.TestReceiver_UpdateBehavior.toCell(updateBehaviorToConsumeAllGas),
    })

    const newBehavior = await receiver.getBehavior()
    expect(newBehavior).toEqual(tr.TestReceiver_Behavior.ConsumeAllGas)

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
      body: r.CCIPReceive.toCell(ccipReceiveSampleMessage),
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
