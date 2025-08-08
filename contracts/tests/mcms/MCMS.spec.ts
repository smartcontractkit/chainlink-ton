import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, Dictionary, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'

import * as mcms from '../../wrappers/mcms/MCMS'
import { crc32 } from 'zlib'

describe('MCMS', () => {
  let blockchain: Blockchain

  var code: {
    mcms: Cell
  }

  beforeAll(async () => {
    code = {
      mcms: await compile('mcms.MCMS'),
    }
  })

  var acc: {
    deployer: SandboxContract<TreasuryContract>
    other: SandboxContract<TreasuryContract>
  }

  var bind: {
    mcms: SandboxContract<mcms.ContractClient>
  }

  beforeEach(async () => {
    blockchain = await Blockchain.create()

    // Set up accounts
    acc = {
      deployer: await blockchain.treasury('deployer'),
      other: await blockchain.treasury('other'),
    }

    bind = {
      mcms: null as any,
    }

    // Set up MCMS contract
    {
      const data = mcms.builder.data.contractDataEmpty(
        crc32('mcms.mcms.test-sandbox'),
        acc.deployer.address,
      )
      bind.mcms = blockchain.openContract(mcms.ContractClient.newFrom(data, code.mcms))
    }
  })

  it('Should compute crc32 opcodes', async () => {
    // In opcodes
    expect(mcms.opcodes.in.TopUp).toBe(0x5f427bb3)
    expect(mcms.opcodes.in.SetRoot).toBe(0xe7fabde3)
    expect(mcms.opcodes.in.Execute).toBe(0x9b9ce96a)
    expect(mcms.opcodes.in.SetConfig).toBe(0x89277f4b)

    // Out opcodes
    expect(mcms.opcodes.out.NewRoot).toBe(0xa6533a3d)
    expect(mcms.opcodes.out.ConfigSet).toBe(0xd80be574)
    expect(mcms.opcodes.out.OpExecuted).toBe(0x7cf37cbf)
  })

  it('should deploy', async () => {
    // Check that MCMS contract is deployed
    const body = mcms.builder.message.topUp.encode({ queryId: 1n })
    const result = await bind.mcms.sendInternal(acc.deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: acc.deployer.address,
      to: bind.mcms.address,
      deploy: true,
      success: true,
    })
  })
})
