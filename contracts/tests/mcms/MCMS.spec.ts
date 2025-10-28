import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'

import { mcms } from '../../wrappers/mcms'
import { crc32 } from 'zlib'
import { errorCode } from '../../wrappers/utils'

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

  it('should compute error code', async () => {
    expect(mcms.Error.OutOfBoundsNumSigners).toBe(
      errorCode(crc32('com.chainlink.ton.mcms.MCMS'), 0),
    )
  })

  it('should compute crc32 opcodes', async () => {
    // In opcodes
    expect(mcms.opcodes.in.SetRoot).toBe(0xe7fabde3)
    expect(mcms.opcodes.in.Execute).toBe(0x9b9ce96a)
    expect(mcms.opcodes.in.SetConfig).toBe(0x89277f4b)
    expect(mcms.opcodes.in.SubmitErrorReport).toBe(0x4b3af0b5)
    expect(mcms.opcodes.in.TransferOracleRole).toBe(0xf275742f)

    // Out opcodes
    expect(mcms.opcodes.out.NewRoot).toBe(0xa6533a3d)
    expect(mcms.opcodes.out.ConfigSet).toBe(0xd80be574)
    expect(mcms.opcodes.out.OpExecuted).toBe(0x7cf37cbf)
    expect(mcms.opcodes.out.ErrorReportedSubmitted).toBe(0xbbc4deb4)
    expect(mcms.opcodes.out.OracleRoleTransferred).toBe(0xff4176a3)
  })

  it('should deploy', async () => {
    // Check that MCMS contract is deployed
    const body = Cell.EMPTY
    const result = await bind.mcms.sendInternal(acc.deployer.getSender(), toNano('0.05'), body)

    expect(result.transactions).toHaveTransaction({
      from: acc.deployer.address,
      to: bind.mcms.address,
      deploy: true,
      success: true,
    })
  })
})
