import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox'
import { toNano, Transaction } from '@ton/core'

import { ContractClient } from '../../../wrappers/data-streams/Verifier'
import { FIXTURE_SET_1 } from './fixtures/fixtureSet1'
import { FIXTURE_SET_2 } from './fixtures/fixtureSet2'
import {
  deployVerifier,
  packSignersCell,
  createConfig,
  signerSubset,
  createSignedReport,
  bufferToSnakeCell,
  getFixtureSet,
} from './helpers'

// ============================================================================
// Gas extraction helpers
// ============================================================================

interface GasReport {
  computeGas: bigint
  computeFee: bigint
  totalFees: bigint
  vmSteps: number
  exitCode: number
  success: boolean
}

function extractGasReport(
  transactions: Transaction[],
  verifierAddress: ReturnType<typeof import('@ton/core').Address.parse>,
): GasReport {
  const tx = transactions.find((t) => {
    if (t.inMessage?.info.type === 'internal') {
      return t.inMessage.info.dest.equals(verifierAddress)
    }
    return false
  })

  if (!tx) {
    throw new Error('Could not find verifier transaction in results')
  }

  const desc = tx.description
  if (desc.type !== 'generic') {
    throw new Error(`Unexpected transaction description type: ${desc.type}`)
  }

  const compute = desc.computePhase
  if (compute.type !== 'vm') {
    return {
      computeGas: 0n,
      computeFee: 0n,
      totalFees: tx.totalFees.coins,
      vmSteps: 0,
      exitCode: -1,
      success: false,
    }
  }

  return {
    computeGas: compute.gasUsed,
    computeFee: compute.gasFees,
    totalFees: tx.totalFees.coins,
    vmSteps: compute.vmSteps,
    exitCode: compute.exitCode,
    success: compute.success,
  }
}

function formatTON(nanotons: bigint): string {
  const whole = nanotons / 1_000_000_000n
  const frac = nanotons % 1_000_000_000n
  const fracStr =
    frac.toString().padStart(9, '0').slice(0, 6).replace(/0+$/, '') || '0'
  return `${whole}.${fracStr}`
}

function logGasReport(label: string, report: GasReport): void {
  console.log(`\n--- Gas Benchmark: ${label} ---`)
  console.log(`  Compute gas used : ${report.computeGas.toString()}`)
  console.log(`  Compute fee      : ${formatTON(report.computeFee)} TON`)
  console.log(`  Total fees       : ${formatTON(report.totalFees)} TON`)
  console.log(`  VM steps         : ${report.vmSteps}`)
  console.log(`  Exit code        : ${report.exitCode}`)
  console.log(`  Success          : ${report.success}`)
}

// ============================================================================
// Deterministic signer generation for larger sets (17-31 signers)
// ============================================================================

function generateSignerAddresses(n: number): string[] {
  const addrs: string[] = []
  for (let i = 0; i < Math.min(n, FIXTURE_SET_1.SIGNER_ADDRESSES.length); i++) {
    addrs.push(FIXTURE_SET_1.SIGNER_ADDRESSES[i])
  }
  for (let i = FIXTURE_SET_1.SIGNER_ADDRESSES.length; i < n; i++) {
    const set2Index = i - FIXTURE_SET_1.SIGNER_ADDRESSES.length
    if (set2Index < FIXTURE_SET_2.SIGNER_ADDRESSES.length) {
      addrs.push(FIXTURE_SET_2.SIGNER_ADDRESSES[set2Index])
    } else {
      addrs.push('0x' + (i + 1).toString(16).padStart(40, '0'))
    }
  }
  return addrs
}

const TON_MAX_GAS_LIMIT = 1_000_000n

// ============================================================================
// Gas Benchmark Tests
// ============================================================================

describe('Gas Benchmarks', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let user: SandboxContract<TreasuryContract>
  let verifier: SandboxContract<ContractClient>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    owner = await blockchain.treasury('owner')
    user = await blockchain.treasury('user')
    verifier = await deployVerifier(blockchain, owner)
  })

  async function sendSetConfig(
    sender: SandboxContract<TreasuryContract>,
    configDigest: bigint,
    signerAddresses: string[],
    f: number,
  ) {
    return verifier.sendSetConfig(sender.getSender(), toNano('2'), {
      configDigest,
      f,
      signers: packSignersCell(signerAddresses),
      signerCount: signerAddresses.length,
    })
  }

  async function sendUpdateConfig(
    sender: SandboxContract<TreasuryContract>,
    configDigest: bigint,
    prevSigners: string[],
    newSigners: string[],
    f: number,
  ) {
    return verifier.sendUpdateConfig(sender.getSender(), toNano('2'), {
      configDigest,
      f,
      prevSigners: packSignersCell(prevSigners),
      prevSignerCount: prevSigners.length,
      newSigners: packSignersCell(newSigners),
      newSignerCount: newSigners.length,
    })
  }

  async function sendVerify(
    sender: SandboxContract<TreasuryContract>,
    payloadBuf: Buffer,
  ) {
    return verifier.sendVerify(sender.getSender(), toNano('3'), {
      data: bufferToSnakeCell(payloadBuf),
    })
  }

  // ====================================================================
  // SetConfig benchmarks
  // ====================================================================

  describe('setConfig gas benchmarks', () => {
    it('setConfig with 4 signers (f=1)', async () => {
      const signers = generateSignerAddresses(4)
      const configDigest = BigInt(
        '0xaa00000000000000000000000000000000000000000000000000000000000001',
      )

      const result = await sendSetConfig(owner, configDigest, signers, 1)

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })

      const report = extractGasReport(result.transactions, verifier.address)
      logGasReport('setConfig - 4 signers (f=1)', report)
      printTransactionFees(result.transactions)

      expect(report.success).toBe(true)
      expect(report.exitCode).toBe(0)
      expect(report.computeGas).toBeLessThan(TON_MAX_GAS_LIMIT)
    })

    it('setConfig with 16 signers (f=5)', async () => {
      const signers = generateSignerAddresses(16)
      const configDigest = BigInt(
        '0xbb00000000000000000000000000000000000000000000000000000000000002',
      )

      const result = await sendSetConfig(owner, configDigest, signers, 5)

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })

      const report = extractGasReport(result.transactions, verifier.address)
      logGasReport('setConfig - 16 signers (f=5)', report)
      printTransactionFees(result.transactions)

      expect(report.success).toBe(true)
      expect(report.exitCode).toBe(0)
      expect(report.computeGas).toBeLessThan(TON_MAX_GAS_LIMIT)
    })

    it('setConfig with 31 signers (f=10)', async () => {
      const signers = generateSignerAddresses(31)
      const configDigest = BigInt(
        '0xcc00000000000000000000000000000000000000000000000000000000000003',
      )

      const result = await sendSetConfig(owner, configDigest, signers, 10)

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })

      const report = extractGasReport(result.transactions, verifier.address)
      logGasReport('setConfig - 31 signers (f=10)', report)
      printTransactionFees(result.transactions)

      expect(report.success).toBe(true)
      expect(report.exitCode).toBe(0)
      expect(report.computeGas).toBeLessThan(TON_MAX_GAS_LIMIT)
    })
  })

  // ====================================================================
  // Verify benchmarks
  // ====================================================================

  describe('verify gas benchmarks', () => {
    it('verify with 2 signatures (f=1, 4 signers)', async () => {
      const { configDigest, signers } = createConfig(1, 4)
      await sendSetConfig(owner, configDigest, signers, 1)

      const selectedSigners = signerSubset(getFixtureSet(1), 0, 1)
      const payload = createSignedReport(1, selectedSigners)
      const result = await sendVerify(user, payload)

      expect(result.transactions).toHaveTransaction({
        from: user.address,
        to: verifier.address,
        success: true,
      })

      const report = extractGasReport(result.transactions, verifier.address)
      logGasReport('verify - 2 signatures (f=1)', report)
      printTransactionFees(result.transactions)

      expect(report.success).toBe(true)
      expect(report.exitCode).toBe(0)
      expect(report.computeGas).toBeLessThan(TON_MAX_GAS_LIMIT)
    })

    it('verify with 6 signatures (f=5, 16 signers)', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const selectedSigners = signerSubset(getFixtureSet(1), 0, 5)
      const payload = createSignedReport(1, selectedSigners)
      const result = await sendVerify(user, payload)

      expect(result.transactions).toHaveTransaction({
        from: user.address,
        to: verifier.address,
        success: true,
      })

      const report = extractGasReport(result.transactions, verifier.address)
      logGasReport('verify - 6 signatures (f=5)', report)
      printTransactionFees(result.transactions)

      expect(report.success).toBe(true)
      expect(report.exitCode).toBe(0)
      expect(report.computeGas).toBeLessThan(TON_MAX_GAS_LIMIT)
    })
  })

  // ====================================================================
  // UpdateConfig benchmarks
  // ====================================================================

  describe('updateConfig gas benchmarks', () => {
    it('updateConfig replacing all 4 signers (f=1)', async () => {
      const prevSigners = FIXTURE_SET_1.SIGNER_ADDRESSES.slice(0, 4)
      const configDigest = BigInt(
        '0xdd00000000000000000000000000000000000000000000000000000000000004',
      )
      await sendSetConfig(owner, configDigest, prevSigners, 1)

      const newSigners = FIXTURE_SET_2.SIGNER_ADDRESSES.slice(0, 4)
      const result = await sendUpdateConfig(owner, configDigest, prevSigners, newSigners, 1)

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })

      const report = extractGasReport(result.transactions, verifier.address)
      logGasReport('updateConfig - replace all 4 signers (f=1)', report)
      printTransactionFees(result.transactions)

      expect(report.success).toBe(true)
      expect(report.exitCode).toBe(0)
      expect(report.computeGas).toBeLessThan(TON_MAX_GAS_LIMIT)
    })

    it('updateConfig replacing all 16 signers (f=5)', async () => {
      const prevSigners = FIXTURE_SET_1.SIGNER_ADDRESSES.slice(0, 16)
      const configDigest = BigInt(
        '0xee00000000000000000000000000000000000000000000000000000000000005',
      )
      await sendSetConfig(owner, configDigest, prevSigners, 5)

      const newSigners = FIXTURE_SET_2.SIGNER_ADDRESSES.slice(0, 16)
      const result = await sendUpdateConfig(owner, configDigest, prevSigners, newSigners, 5)

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })

      const report = extractGasReport(result.transactions, verifier.address)
      logGasReport('updateConfig - replace all 16 signers (f=5)', report)
      printTransactionFees(result.transactions)

      expect(report.success).toBe(true)
      expect(report.exitCode).toBe(0)
      expect(report.computeGas).toBeLessThan(TON_MAX_GAS_LIMIT)
    })

    it('updateConfig replacing all 31 signers (f=10)', async () => {
      const prevSigners = generateSignerAddresses(31)
      const configDigest = BigInt(
        '0xff00000000000000000000000000000000000000000000000000000000000006',
      )
      await sendSetConfig(owner, configDigest, prevSigners, 10)

      const newSigners: string[] = []
      for (let i = 0; i < 31; i++) {
        newSigners.push('0x' + (i + 100).toString(16).padStart(40, '0'))
      }

      const result = await sendUpdateConfig(owner, configDigest, prevSigners, newSigners, 10)

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })

      const report = extractGasReport(result.transactions, verifier.address)
      logGasReport('updateConfig - replace all 31 signers (f=10)', report)
      printTransactionFees(result.transactions)

      expect(report.success).toBe(true)
      expect(report.exitCode).toBe(0)
      expect(report.computeGas).toBeLessThan(TON_MAX_GAS_LIMIT)
    })
  })

  // ====================================================================
  // Summary comparison test
  // ====================================================================

  describe('gas summary', () => {
    it('should print a comparative summary of all operations', async () => {
      const results: {
        operation: string
        gasUsed: bigint
        computeFee: string
        totalFee: string
        vmSteps: number
      }[] = []

      // --- setConfig 4 signers (f=1) ---
      {
        const signers = generateSignerAddresses(4)
        const configDigest = BigInt(
          '0x1100000000000000000000000000000000000000000000000000000000000001',
        )
        const r = await sendSetConfig(owner, configDigest, signers, 1)
        const report = extractGasReport(r.transactions, verifier.address)
        results.push({
          operation: 'setConfig(4 signers, f=1)',
          gasUsed: report.computeGas,
          computeFee: formatTON(report.computeFee),
          totalFee: formatTON(report.totalFees),
          vmSteps: report.vmSteps,
        })
      }

      // --- setConfig 16 signers (f=5) ---
      {
        const signers = generateSignerAddresses(16)
        const configDigest = BigInt(
          '0x2200000000000000000000000000000000000000000000000000000000000002',
        )
        const r = await sendSetConfig(owner, configDigest, signers, 5)
        const report = extractGasReport(r.transactions, verifier.address)
        results.push({
          operation: 'setConfig(16 signers, f=5)',
          gasUsed: report.computeGas,
          computeFee: formatTON(report.computeFee),
          totalFee: formatTON(report.totalFees),
          vmSteps: report.vmSteps,
        })
      }

      // --- setConfig 31 signers (f=10) ---
      {
        const signers = generateSignerAddresses(31)
        const configDigest = BigInt(
          '0x3300000000000000000000000000000000000000000000000000000000000003',
        )
        const r = await sendSetConfig(owner, configDigest, signers, 10)
        const report = extractGasReport(r.transactions, verifier.address)
        results.push({
          operation: 'setConfig(31 signers, f=10)',
          gasUsed: report.computeGas,
          computeFee: formatTON(report.computeFee),
          totalFee: formatTON(report.totalFees),
          vmSteps: report.vmSteps,
        })
      }

      // --- verify 2 signatures (f=1) ---
      {
        const verifyOwner2 = await blockchain.treasury('summaryVerifyOwner2')
        const freshVerifier2 = await deployVerifier(blockchain, verifyOwner2)
        const { configDigest, signers } = createConfig(1, 4)
        await freshVerifier2.sendSetConfig(verifyOwner2.getSender(), toNano('2'), {
          configDigest,
          f: 1,
          signers: packSignersCell(signers),
          signerCount: signers.length,
        })
        const selectedSigners = signerSubset(getFixtureSet(1), 0, 1)
        const payload = createSignedReport(1, selectedSigners)
        const r = await freshVerifier2.sendVerify(user.getSender(), toNano('3'), {
          data: bufferToSnakeCell(payload),
        })
        const report = extractGasReport(r.transactions, freshVerifier2.address)
        results.push({
          operation: 'verify(2 sigs, f=1)',
          gasUsed: report.computeGas,
          computeFee: formatTON(report.computeFee),
          totalFee: formatTON(report.totalFees),
          vmSteps: report.vmSteps,
        })
      }

      // --- verify 6 signatures (f=5) ---
      {
        const verifyOwner6 = await blockchain.treasury('summaryVerifyOwner6')
        const freshVerifier6 = await deployVerifier(blockchain, verifyOwner6)
        const { configDigest, signers } = createConfig(1, 16)
        await freshVerifier6.sendSetConfig(verifyOwner6.getSender(), toNano('2'), {
          configDigest,
          f: 5,
          signers: packSignersCell(signers),
          signerCount: signers.length,
        })
        const selectedSigners = signerSubset(getFixtureSet(1), 0, 5)
        const payload = createSignedReport(1, selectedSigners)
        const r = await freshVerifier6.sendVerify(user.getSender(), toNano('3'), {
          data: bufferToSnakeCell(payload),
        })
        const report = extractGasReport(r.transactions, freshVerifier6.address)
        results.push({
          operation: 'verify(6 sigs, f=5)',
          gasUsed: report.computeGas,
          computeFee: formatTON(report.computeFee),
          totalFee: formatTON(report.totalFees),
          vmSteps: report.vmSteps,
        })
      }

      // --- updateConfig replace all 16 signers (f=5) ---
      {
        const prevSigners = FIXTURE_SET_1.SIGNER_ADDRESSES.slice(0, 16)
        const updateDigest = BigInt(
          '0x5500000000000000000000000000000000000000000000000000000000000005',
        )
        await sendSetConfig(owner, updateDigest, prevSigners, 5)
        const newSigners = FIXTURE_SET_2.SIGNER_ADDRESSES.slice(0, 16)
        const r = await sendUpdateConfig(owner, updateDigest, prevSigners, newSigners, 5)
        const report = extractGasReport(r.transactions, verifier.address)
        results.push({
          operation: 'updateConfig(replace 16, f=5)',
          gasUsed: report.computeGas,
          computeFee: formatTON(report.computeFee),
          totalFee: formatTON(report.totalFees),
          vmSteps: report.vmSteps,
        })
      }

      console.log('\n========================================')
      console.log('  GAS BENCHMARK SUMMARY')
      console.log('========================================')
      console.table(results)

      for (const r of results) {
        expect(r.gasUsed).toBeLessThan(TON_MAX_GAS_LIMIT)
      }
    })
  })
})
