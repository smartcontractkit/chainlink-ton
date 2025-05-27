import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano } from '@ton/core'
import { Counter } from '../wrappers/examples/Counter'
import '@ton/test-utils'

describe('Counter', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let counter: SandboxContract<Counter>

  beforeEach(async () => {
    blockchain = await Blockchain.create()

    counter = blockchain.openContract(await Counter.fromInit(1337n, 13n))

    deployer = await blockchain.treasury('deployer')

    const deployResult = await counter.send(
      deployer.getSender(),
      {
        value: toNano('0.05'),
      },
      {
        $$type: 'SetCount',
        queryId: 1n,
        newCount: 14n,
      },
    )

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
})
