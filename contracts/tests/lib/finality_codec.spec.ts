import '@ton/test-utils'
import { Blockchain, GetMethodError, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, contractAddress, toNano } from '@ton/core'

import { TestLibFinalityCodec } from '../../wrappers/gen/test/TestLibFinalityCodec'
import { contractCode } from '../../wrappers/codeLoader'

// Ported from the EVM spec:
//   chains/evm/contracts/test/libraries/FinalityCodec/FinalityCodec._encodeBlockDepth.t.sol
//   chains/evm/contracts/test/libraries/FinalityCodec/FinalityCodec._encodeBlockDepthAndSafeFlag.t.sol
//   chains/evm/contracts/test/libraries/FinalityCodec/FinalityCodec._validateRequestedFinality.t.sol
//   chains/evm/contracts/test/libraries/FinalityCodec/FinalityCodec._ensureRequestedFinalityAllowed.t.sol
//
// The 32-bit finality value is laid out as:
//   bits 31..17: reserved flags (accepted on the wire)
//   bit 16:      WAIT_FOR_SAFE_FLAG
//   bits 15..0:  block depth
//   value 0:     WAIT_FOR_FINALITY_FLAG
class FinalityCodecContract extends TestLibFinalityCodec {
  static create(code: Cell, data: Cell = Cell.EMPTY, workchain = 0) {
    const init = { code, data }
    return new FinalityCodecContract(contractAddress(workchain, init), init)
  }
}

const BLOCK_DEPTH_BITS = 16n
const BLOCK_DEPTH_MASK = 0xffffn

const WAIT_FOR_FINALITY_FLAG = 0n
const WAIT_FOR_SAFE_FLAG = 1n << BLOCK_DEPTH_BITS
const MAX_BLOCK_DEPTH = BLOCK_DEPTH_MASK
const RESERVED_FLAG_17 = 1n << 17n

const InvalidRequestedFinality =
  TestLibFinalityCodec.Errors['FinalityCodec_Error.InvalidRequestedFinality']
const RequestedFinalityCanOnlyHaveOneMode =
  TestLibFinalityCodec.Errors['FinalityCodec_Error.RequestedFinalityCanOnlyHaveOneMode']

// Mirrors FinalityCodec._encodeBlockDepth.
function encodeBlockDepth(depth: bigint | number): bigint {
  return BigInt(depth) & BLOCK_DEPTH_MASK
}

// runGetMethod throws on a non-zero exit code; surface the code so failures can be
// asserted by exact value, mirroring the EVM custom-error expectations.
async function getMethodExitCode(
  blockchain: Blockchain,
  address: Parameters<Blockchain['runGetMethod']>[0],
  method: string,
  stack: Parameters<Blockchain['runGetMethod']>[2],
): Promise<number> {
  try {
    const result = await blockchain.runGetMethod(address, method, stack)
    return result.exitCode
  } catch (error) {
    if (error instanceof GetMethodError) {
      return error.exitCode
    }
    throw error
  }
}

describe('FinalityCodec', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let codec: SandboxContract<FinalityCodecContract>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')

    const code = await contractCode.ccip.local('TestLibFinalityCodec')
    codec = blockchain.openContract(FinalityCodecContract.create(code))

    const result = await codec.sendDeploy(deployer.getSender(), toNano('0.2'))
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: codec.address,
      deploy: true,
      success: true,
    })
  })

  describe('encodeBlockDepth', () => {
    it.each([
      { depth: 0n, encoded: WAIT_FOR_FINALITY_FLAG },
      { depth: 1n, encoded: 0x00000001n },
      { depth: 16n, encoded: 0x00000010n },
      { depth: 256n, encoded: 0x00000100n },
      { depth: MAX_BLOCK_DEPTH, encoded: 0x0000ffffn },
    ])('encodes depth $depth as $encoded', async ({ depth, encoded }) => {
      await expect(codec.getEncodeBlockDepth(depth)).resolves.toEqual(encoded)
    })

    it('WAIT_FOR_SAFE_FLAG is bit 16', () => {
      expect(WAIT_FOR_SAFE_FLAG).toEqual(0x00010000n)
    })
  })

  describe('encodeBlockDepthAndSafeFlag', () => {
    it('depth 0 leaves only the safe flag in the lower bits as 0', async () => {
      await expect(codec.getEncodeBlockDepthAndSafeFlag(0n)).resolves.toEqual(WAIT_FOR_SAFE_FLAG)
    })

    it('combines the safe flag with a block depth', async () => {
      await expect(codec.getEncodeBlockDepthAndSafeFlag(42n)).resolves.toEqual(
        WAIT_FOR_SAFE_FLAG | 42n,
      )
    })
  })

  describe('validateRequestedFinality', () => {
    it.each([
      { name: 'wait for finality', encoded: WAIT_FOR_FINALITY_FLAG },
      { name: 'wait for safe', encoded: WAIT_FOR_SAFE_FLAG },
      { name: 'pure block depth 1', encoded: encodeBlockDepth(1) },
      { name: 'pure block depth 10', encoded: encodeBlockDepth(10) },
      { name: 'pure block depth max', encoded: encodeBlockDepth(MAX_BLOCK_DEPTH) },
      { name: 'single reserved flag', encoded: RESERVED_FLAG_17 },
    ])('accepts $name', async ({ encoded }) => {
      await expect(codec.getValidateRequestedFinality(encoded)).resolves.toEqual(encoded)
    })

    it.each([
      { name: 'a flag with non-zero depth', encoded: WAIT_FOR_SAFE_FLAG | 1n },
      { name: 'multiple flag bits', encoded: WAIT_FOR_SAFE_FLAG | RESERVED_FLAG_17 },
    ])('reverts when requested has $name', async ({ encoded }) => {
      const exitCode = await getMethodExitCode(
        blockchain,
        codec.address,
        'validateRequestedFinality',
        [{ type: 'int', value: encoded }],
      )
      expect(exitCode).toEqual(RequestedFinalityCanOnlyHaveOneMode)
    })
  })

  describe('ensureRequestedFinalityAllowed', () => {
    async function runEnsure(requested: bigint, allowed: bigint): Promise<number> {
      return getMethodExitCode(blockchain, codec.address, 'ensureRequestedFinalityAllowed', [
        { type: 'int', value: requested },
        { type: 'int', value: allowed },
      ])
    }

    // Mirrors FinalityCodec.sol:_ensureRequestedFinalityAllowed allow cases.
    it.each([
      {
        name: 'finality is always allowed (finality)',
        requested: WAIT_FOR_FINALITY_FLAG,
        allowed: WAIT_FOR_FINALITY_FLAG,
      },
      {
        name: 'finality is always allowed (block depth)',
        requested: WAIT_FOR_FINALITY_FLAG,
        allowed: encodeBlockDepth(1),
      },
      {
        name: 'finality is always allowed (safe)',
        requested: WAIT_FOR_FINALITY_FLAG,
        allowed: WAIT_FOR_SAFE_FLAG,
      },
      {
        name: 'upper flag bits overlap',
        requested: WAIT_FOR_SAFE_FLAG,
        allowed: WAIT_FOR_SAFE_FLAG | encodeBlockDepth(500),
      },
      {
        name: 'block depth exactly meets the minimum',
        requested: encodeBlockDepth(100),
        allowed: encodeBlockDepth(100),
      },
      {
        name: 'block depth is deeper than the minimum',
        requested: encodeBlockDepth(200),
        allowed: encodeBlockDepth(100),
      },
      {
        name: 'block depth is at max vs min allowed',
        requested: encodeBlockDepth(MAX_BLOCK_DEPTH),
        allowed: encodeBlockDepth(1),
      },
      {
        name: 'block depth minimum is exact',
        requested: encodeBlockDepth(1),
        allowed: encodeBlockDepth(1),
      },
      {
        name: 'reserved flag overlaps',
        requested: RESERVED_FLAG_17,
        allowed: RESERVED_FLAG_17,
      },
      {
        name: 'allowed contains multiple modes and a matching flag',
        requested: WAIT_FOR_SAFE_FLAG,
        allowed: WAIT_FOR_SAFE_FLAG | encodeBlockDepth(500),
      },
      {
        name: 'requested depth satisfies the depth part of a multi-mode allowed value',
        requested: encodeBlockDepth(500),
        allowed: WAIT_FOR_SAFE_FLAG | encodeBlockDepth(500),
      },
    ])('allows when $name', async ({ requested, allowed }) => {
      await expect(runEnsure(requested, allowed)).resolves.toEqual(0)
    })

    // Mirrors FinalityCodec.sol:_ensureRequestedFinalityAllowed revert cases.
    it.each([
      {
        name: 'safe is requested but allowed is depth-only',
        requested: WAIT_FOR_SAFE_FLAG,
        allowed: encodeBlockDepth(200),
      },
      {
        name: 'requested depth is below the minimum',
        requested: encodeBlockDepth(99),
        allowed: encodeBlockDepth(100),
      },
      {
        name: 'no matching flag and requested depth exceeds allowed depth',
        requested: encodeBlockDepth(1),
        allowed: WAIT_FOR_SAFE_FLAG,
      },
      {
        name: 'finality is required',
        requested: encodeBlockDepth(50),
        allowed: WAIT_FOR_FINALITY_FLAG,
      },
      {
        name: 'reserved flag is not in allowed',
        requested: RESERVED_FLAG_17,
        allowed: WAIT_FOR_SAFE_FLAG,
      },
    ])('reverts with InvalidRequestedFinality when $name', async ({ requested, allowed }) => {
      await expect(runEnsure(requested, allowed)).resolves.toEqual(InvalidRequestedFinality)
    })

    it.each([
      {
        name: 'a flag is combined with a non-zero depth',
        requested: WAIT_FOR_SAFE_FLAG | encodeBlockDepth(7),
        allowed: WAIT_FOR_SAFE_FLAG | encodeBlockDepth(500),
      },
      {
        name: 'multiple flag bits are set',
        requested: WAIT_FOR_SAFE_FLAG | RESERVED_FLAG_17,
        allowed: WAIT_FOR_SAFE_FLAG | RESERVED_FLAG_17,
      },
    ])(
      'reverts with RequestedFinalityCanOnlyHaveOneMode when $name',
      async ({ requested, allowed }) => {
        await expect(runEnsure(requested, allowed)).resolves.toEqual(
          RequestedFinalityCanOnlyHaveOneMode,
        )
      },
    )

    it('rejects a malformed request even when it equals the allowed value', async () => {
      // Regression for the previous TON exact-equality check, which accepted this.
      const twoFlags = WAIT_FOR_SAFE_FLAG | RESERVED_FLAG_17
      await expect(runEnsure(twoFlags, twoFlags)).resolves.toEqual(
        RequestedFinalityCanOnlyHaveOneMode,
      )
    })
  })
})
