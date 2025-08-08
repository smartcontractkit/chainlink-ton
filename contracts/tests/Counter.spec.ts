import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'

import * as counter from '../wrappers/examples/Counter'

describe('Counter', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let bind: {
    counter: SandboxContract<counter.ContractClient>
  }
  let code: Cell

  beforeEach(async () => {
    blockchain = await Blockchain.create()

    code = await compile('examples.Counter')
    deployer = await blockchain.treasury('deployer')

    bind = {
      counter: blockchain.openContract(
        counter.ContractClient.newFrom(
          { id: 1337, value: 13, ownable: { owner: deployer.address, pendingOwner: null } },
          code,
        ),
      ),
    }

    const deployResult = await bind.counter.sendDeploy(deployer.getSender(), toNano('0.05'))

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.counter.address,
      deploy: true,
      success: true,
    })
  })

  it('should deploy', async () => {
    // the check is done inside beforeEach
    // blockchain and counter are ready to use
  })

  it('should have type and version', async () => {
    const typeAndVersion = await bind.counter.getTypeAndVersion()
    expect(typeAndVersion.type).toBe('com.chainlink.ton.examples.Counter')
    expect(typeAndVersion.version).toBe('1.1.0')
  })

  it('should have the right code and hash', async () => {
    const contractCode = await bind.counter.getCode()
    const expectedHashBuffer = code.hash()
    expect(contractCode.toString('hex')).toBe(code.toString('hex'))
    const expectedHash = BigInt('0x' + expectedHashBuffer.toString('hex'))
    const hash = await bind.counter.getCodeHash()
    expect(hash).toBe(expectedHash)
  })

  it('should count', async () => {
    const initialCount = await bind.counter.getValue()
    expect(initialCount).toBe(13)

    const newCount = 42
    const setCountResult = await bind.counter.sendSetCount(deployer.getSender(), toNano('0.05'), {
      queryId: 1n,
      newCount,
    })

    expect(setCountResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: bind.counter.address,
      success: true,
    })

    const count = await bind.counter.getValue()
    expect(count).toBe(newCount)
  })
})
