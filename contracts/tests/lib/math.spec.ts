import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, toNano } from '@ton/core'
import { math } from '../../wrappers/test/lib'
import { loadContractCode } from '../../wrappers/codeLoader'

describe('math', () => {
  let blockchain: Blockchain

  var code: {
    math: Cell
  }

  beforeAll(async () => {
    code = {
      math: await loadContractCode('tests.lib.math'),
    }
  }, 10_000)

  var acc: {
    deployer: SandboxContract<TreasuryContract>
  }

  var bind: {
    math: SandboxContract<math.ContractClient>
  }

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    blockchain.now = Math.floor(Date.now() / 1000) // set to current unix timestamp

    // Set up accounts
    acc = {
      deployer: await blockchain.treasury('deployer'),
    }

    bind = {
      math: null as any,
    }

    // Set up verifier contract
    {
      bind.math = blockchain.openContract(math.ContractClient.newFrom(Cell.EMPTY, code.math))
    }

    // Deploy verifier contract
    {
      const body = Cell.EMPTY
      const r = await bind.math.sendInternal(acc.deployer.getSender(), toNano('0.2'), body)

      expect(r.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.math.address,
        deploy: true,
        success: true,
      })
    }
  })

  describe('safeAdd', () => {
    it('should add two positive numbers without overflow', async () => {
      const result = await bind.math.getSafeAdd(100n, 200n)
      expect(result.stack.readBigNumber()).toBe(300n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should add two negative numbers without underflow', async () => {
      const result = await bind.math.getSafeAdd(-100n, -200n)
      expect(result.stack.readBigNumber()).toBe(-300n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should add positive and negative numbers', async () => {
      const result = await bind.math.getSafeAdd(500n, -200n)
      expect(result.stack.readBigNumber()).toBe(300n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should add with zero', async () => {
      const result = await bind.math.getSafeAdd(100n, 0n)
      expect(result.stack.readBigNumber()).toBe(100n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should detect positive overflow', async () => {
      // INT_MAX = 2^256 - 1
      const INT_MAX = (1n << 256n) - 1n
      const result = await bind.math.getSafeAdd(INT_MAX, 1n)
      expect(result.stack.readBigNumber()).toBe(0n) // result
      expect(result.stack.readBigNumber()).toBe(1n) // error code 1 = overflow
    })

    it('should detect negative overflow (underflow)', async () => {
      // INT_MIN = -2^256
      const INT_MIN = -(1n << 256n)
      const result = await bind.math.getSafeAdd(INT_MIN, -1n)
      expect(result.stack.readBigNumber()).toBe(0n) // result
      expect(result.stack.readBigNumber()).toBe(2n) // error code 2 = underflow
    })

    it('should handle edge case at boundary', async () => {
      const INT_MAX = (1n << 256n) - 1n
      const result = await bind.math.getSafeAdd(INT_MAX, 0n)
      expect(result.stack.readBigNumber()).toBe(INT_MAX) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should handle large positive numbers near max', async () => {
      const INT_MAX = (1n << 256n) - 1n
      const result = await bind.math.getSafeAdd(INT_MAX - 100n, 50n)
      expect(result.stack.readBigNumber()).toBe(INT_MAX - 50n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })
  })

  describe('safeProd', () => {
    it('should multiply two positive numbers', async () => {
      const result = await bind.math.getSafeProd(10n, 20n)
      expect(result.stack.readBigNumber()).toBe(200n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should multiply two negative numbers', async () => {
      const result = await bind.math.getSafeProd(-10n, -20n)
      expect(result.stack.readBigNumber()).toBe(200n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should multiply positive and negative numbers', async () => {
      const result = await bind.math.getSafeProd(10n, -20n)
      expect(result.stack.readBigNumber()).toBe(-200n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should handle multiplication by zero', async () => {
      const result = await bind.math.getSafeProd(12345n, 0n)
      expect(result.stack.readBigNumber()).toBe(0n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should handle multiplication by one', async () => {
      const result = await bind.math.getSafeProd(12345n, 1n)
      expect(result.stack.readBigNumber()).toBe(12345n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should handle multiplication by -1', async () => {
      const result = await bind.math.getSafeProd(12345n, -1n)
      expect(result.stack.readBigNumber()).toBe(-12345n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should detect overflow with -1 * INT_MIN', async () => {
      const INT_MIN = -(1n << 256n)
      const result = await bind.math.getSafeProd(-1n, INT_MIN)
      expect(result.stack.readBigNumber()).toBe(0n) // result
      expect(result.stack.readBigNumber()).toBe(1n) // error code 1 = overflow
    })

    it('should detect positive overflow with large positive numbers', async () => {
      const largeNum = 1n << 200n
      const result = await bind.math.getSafeProd(largeNum, largeNum)
      expect(result.stack.readBigNumber()).toBe(0n) // result
      expect(result.stack.readBigNumber()).toBe(1n) // error code 1 = overflow
    })

    it('should detect overflow with large negative numbers', async () => {
      const largeNegNum = -(1n << 200n)
      const result = await bind.math.getSafeProd(largeNegNum, largeNegNum)
      expect(result.stack.readBigNumber()).toBe(0n) // result
      expect(result.stack.readBigNumber()).toBe(1n) // error code 1 = overflow
    })

    it('should detect underflow with positive * negative large numbers', async () => {
      const largePos = 1n << 200n
      const largeNeg = -(1n << 200n)
      const result = await bind.math.getSafeProd(largePos, largeNeg)
      expect(result.stack.readBigNumber()).toBe(0n) // result
      expect(result.stack.readBigNumber()).toBe(2n) // error code 2 = underflow
    })

    it('should handle safe large multiplication', async () => {
      const result = await bind.math.getSafeProd(1000000n, 1000000n)
      expect(result.stack.readBigNumber()).toBe(1000000000000n) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })

    it('should handle edge case near INT_MAX', async () => {
      const INT_MAX = (1n << 256n) - 1n
      const result = await bind.math.getSafeProd(INT_MAX, 1n)
      expect(result.stack.readBigNumber()).toBe(INT_MAX) // result
      expect(result.stack.readBigNumber()).toBe(0n) // error code
    })
  })

  describe('mustAdd', () => {
    it('should add two numbers successfully', async () => {
      const result = await bind.math.getMustAdd(100n, 200n, 100n)
      expect(result.stack.readBigNumber()).toBe(300n)
    })

    it('should throw on positive overflow', async () => {
      const INT_MAX = (1n << 256n) - 1n
      await expect(bind.math.getMustAdd(INT_MAX, 1n, 100n)).rejects.toThrow()
    })

    it('should throw on negative overflow', async () => {
      const INT_MIN = -(1n << 256n)
      await expect(bind.math.getMustAdd(INT_MIN, -1n, 100n)).rejects.toThrow()
    })

    it('should handle zero addition', async () => {
      const result = await bind.math.getMustAdd(42n, 0n, 100n)
      expect(result.stack.readBigNumber()).toBe(42n)
    })

    it('should handle positive and negative addition', async () => {
      const result = await bind.math.getMustAdd(100n, -50n, 100n)
      expect(result.stack.readBigNumber()).toBe(50n)
    })
  })

  describe('mustProd', () => {
    it('should multiply two numbers successfully', async () => {
      const result = await bind.math.getMustProd(10n, 20n, 100n)
      expect(result.stack.readBigNumber()).toBe(200n)
    })

    it('should throw on positive overflow', async () => {
      const largeNum = 1n << 200n
      await expect(bind.math.getMustProd(largeNum, largeNum, 100n)).rejects.toThrow()
    })

    it('should throw on underflow', async () => {
      const largePos = 1n << 200n
      const largeNeg = -(1n << 200n)
      await expect(bind.math.getMustProd(largePos, largeNeg, 100n)).rejects.toThrow()
    })

    it('should handle multiplication by zero', async () => {
      const result = await bind.math.getMustProd(12345n, 0n, 100n)
      expect(result.stack.readBigNumber()).toBe(0n)
    })

    it('should handle multiplication by one', async () => {
      const result = await bind.math.getMustProd(12345n, 1n, 100n)
      expect(result.stack.readBigNumber()).toBe(12345n)
    })

    it('should handle multiplication by -1', async () => {
      const result = await bind.math.getMustProd(12345n, -1n, 100n)
      expect(result.stack.readBigNumber()).toBe(-12345n)
    })

    it('should throw on -1 * INT_MIN', async () => {
      const INT_MIN = -(1n << 256n)
      await expect(bind.math.getMustProd(-1n, INT_MIN, 100n)).rejects.toThrow()
    })

    it('should handle large safe multiplication', async () => {
      const result = await bind.math.getMustProd(1000000n, 1000000n, 100n)
      expect(result.stack.readBigNumber()).toBe(1000000000000n)
    })
  })
})
