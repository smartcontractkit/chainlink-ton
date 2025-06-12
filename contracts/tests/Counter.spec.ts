import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import { Counter } from '../wrappers/examples/Counter'
import '@ton/test-utils'
import { compile } from '@ton/blueprint'

describe('Counter', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let counter: SandboxContract<Counter>
  let code: Cell

  beforeEach(async () => {
    blockchain = await Blockchain.create()

    code = await compile('Counter')

    counter = blockchain.openContract(Counter.createFromConfig({ id: 1337, value: 13 }, code))

    deployer = await blockchain.treasury('deployer')

    const deployResult = await counter.sendDeploy(deployer.getSender(), toNano('0.05'))

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: counter.address,
      deploy: true,
      success: true,
    })
  })

  it('should deploy', async () => {
    // the check is done inside beforeEach
    // blockchain and counter are ready to use
  })

  it('should have type and version', async () => {
    const typeAndVersion = await counter.getTypeAndVersion()
    expect(typeAndVersion).toBe('com.chainlink.ton.examples.Counter v1.0.0')
  })

  it('should have the right code and hash', async () => {
    const contractCode = await counter.getCode()
    const expectedHashBuffer = code.hash()
    expect(contractCode.toString('hex')).toBe(code.toString('hex'))
    const expectedHash = BigInt('0x' + expectedHashBuffer.toString('hex'))
    const hash = await counter.getCodeHash()
    expect(hash).toBe(expectedHash)
  })

  it('should count', async () => {
    const initialCount = await counter.getValue()
    expect(initialCount).toBe(13)

    const newCount = 42
    const setCountResult = await counter.sendSetCount(deployer.getSender(), {
      value: toNano('0.05'),
      queryId: 1,
      newCount,
    })

    expect(setCountResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: counter.address,
      success: true,
    })

    const count = await counter.getValue()
    expect(count).toBe(newCount)
  })
})
