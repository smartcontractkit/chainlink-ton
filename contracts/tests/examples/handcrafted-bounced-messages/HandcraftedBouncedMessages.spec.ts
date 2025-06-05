import { Blockchain, SandboxContract, Treasury, TreasuryContract } from '@ton/sandbox'
import { Address, address, beginCell, Cell, Message, toNano } from '@ton/core'
import '@ton/test-utils'
import {
  Bouncer,
  loadError,
  loadErrorEvent,
  loadSuccessEvent,
} from '../../../wrappers/examples/handcrafted-bounced-messages/Bouncer'
import {
  loadSendRequest,
  loadSuccess,
  Requester,
} from '../../../wrappers/examples/handcrafted-bounced-messages/Requester'

async function setUpTest(): Promise<{
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  owner: SandboxContract<TreasuryContract>
  requester: SandboxContract<Requester>
  bouncer: SandboxContract<Bouncer>
}> {
  // Verbosity = 'none' | 'vm_logs' | 'vm_logs_location' | 'vm_logs_gas' | 'vm_logs_full' | 'vm_logs_verbose';
  let blockchain = await Blockchain.create()
  blockchain.verbosity = {
    print: true,
    blockchainLogs: false,
    vmLogs: 'none',
    debugLogs: true,
  }

  let deployer = await blockchain.treasury('deployer')
  let owner = await blockchain.treasury('owner')

  let requester = blockchain.openContract(await Requester.fromInit())

  const requesterDeployResult = await requester.send(
    deployer.getSender(),
    {
      value: toNano('0.05'),
    },
    null,
  )

  expect(requesterDeployResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: requester.address,
    deploy: true,
    success: true,
  })

  let bouncer = blockchain.openContract(await Bouncer.fromInit())

  const bouncerDeployResult = await bouncer.send(
    deployer.getSender(),
    {
      value: toNano('0.05'),
    },
    null,
  )

  expect(bouncerDeployResult.transactions).toHaveTransaction({
    from: deployer.address,
    to: bouncer.address,
    deploy: true,
    success: true,
  })

  return {
    blockchain,
    deployer,
    owner,
    requester,
    bouncer,
  }
}

describe('HandcraftedBouncedMessages', () => {
  it('should deploy', async () => {
    await setUpTest()
  })

  it('should not bounce message', async () => {
    let { blockchain, deployer, requester, bouncer } = await setUpTest()
    const requestResult = await requester.send(
      deployer.getSender(),
      { value: toNano('0.05'), bounce: false },
      {
        $$type: 'SendRequest',
        queryId: 1n,
        address: bouncer.address,
        value: 1n,
      },
    )

    expect(requestResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: requester.address,
      success: true,
    })

    const successTransaction = requestResult.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(bouncer.address) &&
        tx.inMessage.info.dest.equals(requester.address),
    )

    const successBody = successTransaction?.inMessage?.body.beginParse()
    const bouncedMessage = loadSuccess(successBody!)
    expect(bouncedMessage).toEqual({
      $$type: 'Success',
      queryId: 1n,
    })

    const event = successTransaction?.outMessages.values().find((msg: Message) => {
      return msg.info.type === 'external-out'
    })
    let eventBody = event?.body.beginParse()
    let bouncedEvent = loadSuccessEvent(eventBody!)
    expect(bouncedEvent).toEqual({
      $$type: 'SuccessEvent',
      queryId: 1n,
    })
  })

  it('should bounce message', async () => {
    let { deployer, requester, bouncer } = await setUpTest()
    const requestResult = await requester.send(
      deployer.getSender(),
      { value: toNano('0.05'), bounce: true },
      {
        $$type: 'SendRequest',
        queryId: 1n,
        address: bouncer.address,
        value: 5n,
      },
    )

    expect(requestResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: requester.address,
      success: true,
    })

    const errorTransaction = requestResult.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src.equals(bouncer.address) &&
        tx.inMessage.info.dest.equals(requester.address),
    )

    const errorBody = errorTransaction?.inMessage?.body.beginParse()
    const errorMessage = loadError(errorBody!)
    expect(errorMessage).toEqual({
      $$type: 'Error',
      queryId: 1n,
      exitCode: 5n,
    })

    const event = errorTransaction?.outMessages.values().find((msg: Message) => {
      return msg.info.type === 'external-out'
    })
    let eventBody = event?.body.beginParse()
    let errorEvent = loadErrorEvent(eventBody!)
    expect(errorEvent).toEqual({
      $$type: 'ErrorEvent',
      queryId: 1n,
      exitCode: 5n,
    })
  })
})
