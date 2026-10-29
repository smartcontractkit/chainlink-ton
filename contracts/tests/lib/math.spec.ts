import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, contractAddress, toNano } from '@ton/core'

import { TestLibMath, Math_Result } from '../../wrappers/gen/test/TestLibMath'

// Extends the generated wrapper to expose a public factory for deployment,
// since the base constructor is protected.
class MathContract extends TestLibMath {
  static create(code: Cell = TestLibMath.CodeCell, data: Cell = Cell.EMPTY, workchain = 0) {
    const init = { code, data }
    return new MathContract(contractAddress(workchain, init), init)
  }
}

// 257-bit signed integer bounds
const INT_MAX = (1n << 256n) - 1n
const INT_MIN = -(1n << 256n)

// Error code passed to must* functions
const MUST_ERR = 100n

// Largest exponent accepted by safePow10: 10^77 is the largest power of 10 that fits uint256
const MAX_EXP10 = 77n

type BinaryOpCase = {
  name: string
  a: bigint
  b: bigint
  result: bigint
  errorCode: Math_Result
}

type UnaryOpCase = {
  name: string
  n: bigint
  result: bigint
  errorCode: Math_Result
}

describe('math', () => {
  let blockchain: Blockchain

  var acc: {
    deployer: SandboxContract<TreasuryContract>
  }

  var bind: {
    math: SandboxContract<MathContract>
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

    // Set up math contract
    {
      bind.math = blockchain.openContract(MathContract.create())
    }

    // Deploy math contract
    {
      const r = await bind.math.sendDeploy(acc.deployer.getSender(), toNano('0.2'))

      expect(r.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.math.address,
        deploy: true,
        success: true,
      })
    }
  })

  describe('add', () => {
    const addCases: BinaryOpCase[] = [
      { name: 'two positive numbers', a: 100n, b: 200n, result: 300n, errorCode: Math_Result.Ok },
      {
        name: 'two negative numbers',
        a: -100n,
        b: -200n,
        result: -300n,
        errorCode: Math_Result.Ok,
      },
      {
        name: 'positive and negative numbers',
        a: 500n,
        b: -200n,
        result: 300n,
        errorCode: Math_Result.Ok,
      },
      { name: 'with zero', a: 100n, b: 0n, result: 100n, errorCode: Math_Result.Ok },
      { name: 'zero addition', a: 42n, b: 0n, result: 42n, errorCode: Math_Result.Ok },
      {
        name: 'positive and negative addition',
        a: 100n,
        b: -50n,
        result: 50n,
        errorCode: Math_Result.Ok,
      },
      {
        name: 'positive overflow',
        a: INT_MAX,
        b: 1n,
        result: 0n,
        errorCode: Math_Result.Overflow,
      },
      {
        name: 'negative overflow (underflow)',
        a: INT_MIN,
        b: -1n,
        result: 0n,
        errorCode: Math_Result.Underflow,
      },
      {
        name: 'edge case at boundary',
        a: INT_MAX,
        b: 0n,
        result: INT_MAX,
        errorCode: Math_Result.Ok,
      },
      {
        name: 'large positive numbers near max',
        a: INT_MAX - 100n,
        b: 50n,
        result: INT_MAX - 50n,
        errorCode: Math_Result.Ok,
      },
    ]

    for (const tc of addCases) {
      describe(tc.name, () => {
        it('safe returns (result, errorCode)', async () => {
          const [result, errorCode] = await bind.math.getSafeAdd(tc.a, tc.b)
          expect(result).toBe(tc.result)
          expect(errorCode).toBe(tc.errorCode)
        })

        if (tc.errorCode === Math_Result.Ok) {
          it('must returns result', async () => {
            const result = await bind.math.getMustAdd(tc.a, tc.b, MUST_ERR)
            expect(result).toBe(tc.result)
          })
        } else {
          it('must throws', async () => {
            await expect(bind.math.getMustAdd(tc.a, tc.b, MUST_ERR)).rejects.toThrow()
          })
        }
      })
    }
  })

  describe('prod', () => {
    const prodCases: BinaryOpCase[] = [
      { name: 'two positive numbers', a: 10n, b: 20n, result: 200n, errorCode: Math_Result.Ok },
      {
        name: 'two negative numbers',
        a: -10n,
        b: -20n,
        result: 200n,
        errorCode: Math_Result.Ok,
      },
      {
        name: 'positive and negative numbers',
        a: 10n,
        b: -20n,
        result: -200n,
        errorCode: Math_Result.Ok,
      },
      {
        name: 'multiplication by zero',
        a: 12345n,
        b: 0n,
        result: 0n,
        errorCode: Math_Result.Ok,
      },
      {
        name: 'multiplication by one',
        a: 12345n,
        b: 1n,
        result: 12345n,
        errorCode: Math_Result.Ok,
      },
      {
        name: 'multiplication by -1',
        a: 12345n,
        b: -1n,
        result: -12345n,
        errorCode: Math_Result.Ok,
      },
      {
        name: 'overflow with -1 * INT_MIN',
        a: -1n,
        b: INT_MIN,
        result: 0n,
        errorCode: Math_Result.Overflow,
      },
      {
        name: 'positive overflow with large positive numbers',
        a: 1n << 200n,
        b: 1n << 200n,
        result: 0n,
        errorCode: Math_Result.Overflow,
      },
      {
        name: 'overflow with large negative numbers',
        a: -(1n << 200n),
        b: -(1n << 200n),
        result: 0n,
        errorCode: Math_Result.Overflow,
      },
      {
        name: 'underflow with positive * negative large numbers',
        a: 1n << 200n,
        b: -(1n << 200n),
        result: 0n,
        errorCode: Math_Result.Underflow,
      },
      {
        name: 'safe large multiplication',
        a: 1000000n,
        b: 1000000n,
        result: 1000000000000n,
        errorCode: Math_Result.Ok,
      },
      {
        name: 'edge case near INT_MAX',
        a: INT_MAX,
        b: 1n,
        result: INT_MAX,
        errorCode: Math_Result.Ok,
      },
    ]

    for (const tc of prodCases) {
      describe(tc.name, () => {
        it('safe returns (result, errorCode)', async () => {
          const [result, errorCode] = await bind.math.getSafeProd(tc.a, tc.b)
          expect(result).toBe(tc.result)
          expect(errorCode).toBe(tc.errorCode)
        })

        if (tc.errorCode === Math_Result.Ok) {
          it('must returns result', async () => {
            const result = await bind.math.getMustProd(tc.a, tc.b, MUST_ERR)
            expect(result).toBe(tc.result)
          })
        } else {
          it('must throws', async () => {
            await expect(bind.math.getMustProd(tc.a, tc.b, MUST_ERR)).rejects.toThrow()
          })
        }
      })
    }
  })

  describe('pow10', () => {
    const pow10Cases: UnaryOpCase[] = [
      { name: '10^0 = 1', n: 0n, result: 1n, errorCode: Math_Result.Ok },
      { name: '10^1 = 10', n: 1n, result: 10n, errorCode: Math_Result.Ok },
      { name: '10^2 = 100', n: 2n, result: 100n, errorCode: Math_Result.Ok },
      { name: '10^3 = 1000 (odd exponent)', n: 3n, result: 1000n, errorCode: Math_Result.Ok },
      { name: '10^7 (odd exponent)', n: 7n, result: 10_000_000n, errorCode: Math_Result.Ok },
      { name: '10^10', n: 10n, result: 10_000_000_000n, errorCode: Math_Result.Ok },
      {
        name: '10^18 (common decimals)',
        n: 18n,
        result: 10n ** 18n,
        errorCode: Math_Result.Ok,
      },
      {
        name: '10^77 (max allowed exponent)',
        n: MAX_EXP10,
        result: 10n ** MAX_EXP10,
        errorCode: Math_Result.Ok,
      },
      {
        name: 'overflow for n = 78',
        n: 78n,
        result: 0n,
        errorCode: Math_Result.Overflow,
      },
      {
        name: 'overflow for n = 255 (max uint8)',
        n: 255n,
        result: 0n,
        errorCode: Math_Result.Overflow,
      },
    ]

    for (const tc of pow10Cases) {
      describe(tc.name, () => {
        it('safe returns (result, errorCode)', async () => {
          const [result, errorCode] = await bind.math.getSafePow10(tc.n)
          expect(result).toBe(tc.result)
          expect(errorCode).toBe(tc.errorCode)
        })

        if (tc.errorCode === Math_Result.Ok) {
          it('must returns result', async () => {
            const result = await bind.math.getMustPow10(tc.n, MUST_ERR)
            expect(result).toBe(tc.result)
          })
        } else {
          it('must throws', async () => {
            await expect(bind.math.getMustPow10(tc.n, MUST_ERR)).rejects.toThrow()
          })
        }
      })
    }

    // Limits of the binary-exponentiation loop: every intermediate (result * base, base * base)
    // is a sub-product of the final 10^n, so for n <= MAX_EXP10 nothing can overflow uint256.
    // The in-loop overflow assert is an unreachable invariant; these cases pin the boundary.
    describe('limits', () => {
      it('10^76 * 10 (worst-case in-loop product) stays within uint256', async () => {
        // n = 76: the loop squares base up to 10^64 and multiplies result 10^12 * 10^64 = 10^76,
        // the largest in-loop product below the 10^77 boundary.
        const [result, errorCode] = await bind.math.getSafePow10(76n)
        expect(errorCode).toBe(Math_Result.Ok)
        expect(result).toBe(10n ** 76n)
      })

      it('10^77 (largest power of 10 fitting uint256) succeeds', async () => {
        // 10^77 < 2^256 <= 10^78: the boundary exponent must succeed, not throw.
        const [result, errorCode] = await bind.math.getSafePow10(MAX_EXP10)
        expect(errorCode).toBe(Math_Result.Ok)
        expect(result).toBe(10n ** MAX_EXP10)
        expect(result).toBeLessThan(1n << 256n)
      })

      it('10^78 would exceed uint256 and is rejected without throwing', async () => {
        // 10^78 > 2^256: rejected by the MAX_EXP10 guard, returning Overflow instead of
        // hitting the in-loop assert (which would throw TVMError.IntegerOverflow).
        const [result, errorCode] = await bind.math.getSafePow10(MAX_EXP10 + 1n)
        expect(errorCode).toBe(Math_Result.Overflow)
        expect(result).toBe(0n)
      })

      it('mustPow10 throws the caller error code at the boundary', async () => {
        await expect(bind.math.getMustPow10(MAX_EXP10, MUST_ERR)).resolves.toBe(10n ** MAX_EXP10)
        await expect(bind.math.getMustPow10(MAX_EXP10 + 1n, MUST_ERR)).rejects.toThrow()
      })
    })
  })
})
