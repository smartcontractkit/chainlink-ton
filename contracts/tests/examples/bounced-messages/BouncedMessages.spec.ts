import { Blockchain, SandboxContract, Treasury, TreasuryContract } from '@ton/sandbox'
import { Address, address, beginCell, Cell, Message, toNano } from '@ton/core'
import '@ton/test-utils'
import { Bouncer, loadRequest } from '../../../wrappers/examples/bounced-messages/Bouncer'
import { loadSendRequest, Requester } from '../../../wrappers/examples/bounced-messages/Requester'

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

describe('BouncedMessages', () => {
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

    const bouncedTransaction = requestResult.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.bounced === false &&
        tx.inMessage.info.src.equals(bouncer.address) &&
        tx.inMessage.info.dest.equals(requester.address),
    )

    expect(bouncedTransaction).toBeUndefined()
  })

  it('should bounce message', async () => {
    let { blockchain, deployer, requester, bouncer } = await setUpTest()
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

    const bouncedTransaction = requestResult.transactions.find(
      (tx) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.bounced === true &&
        tx.inMessage.info.src.equals(bouncer.address) &&
        tx.inMessage.info.dest.equals(requester.address),
    )

    const bouncedBody = bouncedTransaction?.inMessage?.body.beginParse()
    let bouncedOpcode = bouncedBody?.loadUint(32)
    expect(bouncedOpcode).toEqual(0xffffffff) // This is the opcode for bounced messages
    const bouncedMessage = loadRequest(bouncedBody!)
    expect(bouncedMessage).toEqual({
      $$type: 'Request',
      queryId: 1n,
      value: 5n,
    })

    expect(bouncedTransaction).toHaveTransaction({
      from: bouncer.address,
      outMessagesCount: 1,
      inMessageBounced: true,
    })

    const event = bouncedTransaction?.outMessages.values().find((msg: Message) => {
      return msg.info.type === 'external-out'
    })
    const comment = loadComment(event!)
    expect(comment).toBe('Bounced message received')
  })
})

function loadComment(event: Message) {
  const eventSlice = event.body.beginParse()!
  eventSlice.skip(32)
  const len = eventSlice.remainingBits
  const bits = eventSlice.loadBits(len)

  const bytesAsHex = bits.toString()
  const bytes = Buffer.from(bytesAsHex, 'hex')
  const string = bytes.toString('utf8')

  return string
}
