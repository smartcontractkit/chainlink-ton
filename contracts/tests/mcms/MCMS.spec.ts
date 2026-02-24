import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import { crc32 } from 'zlib'
import * as coverage from '../coverage/coverage'

import { mcms } from '../../wrappers/mcms'
import { errorCode } from '../../wrappers/utils'
import { generateRandomContractId } from '../../src/utils'

describe('MCMS', () => {
  let blockchain: Blockchain

  var code: {
    mcms: Cell
  }

  var acc: {
    deployer: SandboxContract<TreasuryContract>
    other: SandboxContract<TreasuryContract>
  }

  var bind: {
    mcms: SandboxContract<mcms.ContractClient>
  }

  beforeAll(async () => {
    code = {
      mcms: await mcms.ContractClient.code(),
    }
    blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
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
        Number(generateRandomContractId()),
        acc.deployer.address,
      )
      bind.mcms = blockchain.openContract(mcms.ContractClient.newFrom(data, code.mcms))
    }
  })

  it('should compute error code', async () => {
    expect(mcms.Error.OutOfBoundsNumSigners).toBe(errorCode(crc32('link.chain.ton.mcms.MCMS')))
  })

  it('should compute crc32 opcodes', async () => {
    // In opcodes
    expect(mcms.opcodes.in.SetRoot).toBe(0xe7fabde3)
    expect(mcms.opcodes.in.Execute).toBe(0x9b9ce96a)
    expect(mcms.opcodes.in.SetConfig).toBe(0x89277f4b)
    expect(mcms.opcodes.in.UpdateOpFinalizationTimeout).toBe(0x9dcbbab1)
    expect(mcms.opcodes.in.SubmitErrorReport).toBe(0x4b3af0b5)
    expect(mcms.opcodes.in.TransferOracleRole).toBe(0xf275742f)
    expect(mcms.opcodes.in.CleanExpiredRoots).toBe(0xa903c276)

    // Out opcodes
    expect(mcms.opcodes.out.NewRoot).toBe(0xa6533a3d)
    expect(mcms.opcodes.out.ConfigSet).toBe(0xd80be574)
    expect(mcms.opcodes.out.OpExecuted).toBe(0x7cf37cbf)
    expect(mcms.opcodes.out.OpFinalizationTimeoutChange).toBe(0x16fc10e6)
    expect(mcms.opcodes.out.ErrorReportedSubmitted).toBe(0xbbc4deb4)
    expect(mcms.opcodes.out.OracleRoleTransferred).toBe(0xff4176a3)
    expect(mcms.opcodes.out.ExpiredRootsCleaned).toBe(0xa86846d5)
    expect(mcms.opcodes.out.BounceHandled).toBe(0xe695431e)
  })

  it('should correctly encode the EIP191 prefix to hex', () => {
    // The prefix as a string with escape sequences
    const prefix = '\x19Ethereum Signed Message:\n32'

    // Convert to hex string
    const hexEncoded = Buffer.from(prefix, 'utf-8').toString('hex')

    const expected = '19457468657265756d205369676e6564204d6573736167653a0a3332'
    expect(hexEncoded).toBe(expected)
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

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(blockchain, 'mcms_unit_tests', [
        {
          code: code.mcms,
          name: 'mcms',
        },
      ])
    }
  })
})
