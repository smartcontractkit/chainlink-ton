import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, toNano } from '@ton/core'

import { ContractClient } from '../../../wrappers/data-streams/Verifier'
import { FIXTURE_SET_1 } from './fixtures/fixtureSet1'
import { FIXTURE_SET_2 } from './fixtures/fixtureSet2'
import { REAL_REPORT } from './fixtures/realReport'
import {
  deployVerifier,
  packSignersCell,
  createConfig,
  signerSubset,
  createSignedReport,
  createSignedReportCustomSigners,
  createSignedReportMismatched,
  bufferToSnakeCell,
  hexToBytes,
  getFixtureSet,
} from './helpers'

describe('Verifier', () => {
  let blockchain: Blockchain
  let owner: SandboxContract<TreasuryContract>
  let nonOwner: SandboxContract<TreasuryContract>
  let verifier: SandboxContract<ContractClient>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    owner = await blockchain.treasury('owner')
    nonOwner = await blockchain.treasury('nonOwner')
    verifier = await deployVerifier(blockchain, owner)
  })

  // ========================================================================
  // Helper: send SetConfig message
  // ========================================================================

  async function sendSetConfig(
    sender: SandboxContract<TreasuryContract>,
    configDigest: bigint,
    signerAddresses: string[],
    f: number,
  ) {
    return verifier.sendSetConfig(sender.getSender(), toNano('1'), {
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
    return verifier.sendUpdateConfig(sender.getSender(), toNano('1'), {
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
    return verifier.sendVerify(sender.getSender(), toNano('2'), {
      data: bufferToSnakeCell(payloadBuf),
    })
  }

  async function sendActivateConfig(
    sender: SandboxContract<TreasuryContract>,
    configDigest: bigint,
  ) {
    return verifier.sendActivateConfig(sender.getSender(), toNano('0.5'), { configDigest })
  }

  async function sendDeactivateConfig(
    sender: SandboxContract<TreasuryContract>,
    configDigest: bigint,
  ) {
    return verifier.sendDeactivateConfig(sender.getSender(), toNano('0.5'), { configDigest })
  }

  async function sendTransferOwnership(
    sender: SandboxContract<TreasuryContract>,
    newOwner: Address,
  ) {
    return verifier.sendTransferOwnership(sender.getSender(), toNano('0.5'), { newOwner })
  }

  async function sendAcceptOwnership(sender: SandboxContract<TreasuryContract>) {
    return verifier.sendAcceptOwnership(sender.getSender(), toNano('0.5'))
  }

  // ========================================================================
  // Deployment tests
  // ========================================================================

  describe('Deployment', () => {
    it('should deploy successfully', async () => {
      const ownerAddr = await verifier.getOwner()
      expect(ownerAddr.equals(owner.address)).toBe(true)
    })

    it('should return correct typeAndVersion', async () => {
      const tav = await verifier.getTypeAndVersion()
      expect(tav.type).toBe('link.chain.ton.data_streams.Verifier')
      expect(tav.version).toBe('1.0.0')
    })

    it('should have no pending owner initially', async () => {
      const pending = await verifier.getPendingOwner()
      expect(pending).toBeNull()
    })
  })

  // ========================================================================
  // SetConfig tests
  // ========================================================================

  describe('SetConfig', () => {
    it('should set config successfully', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      const result = await sendSetConfig(owner, configDigest, signers, 5)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should revert if not owner', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      const result = await sendSetConfig(nonOwner, configDigest, signers, 5)
      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert if f is zero', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      const result = await sendSetConfig(owner, configDigest, signers, 0)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert if excess signers (> 31)', async () => {
      const tooManySigners: string[] = []
      for (let i = 0; i < 32; i++) {
        tooManySigners.push('0x' + (i + 1).toString(16).padStart(40, '0'))
      }
      const result = await sendSetConfig(
        owner,
        BigInt(FIXTURE_SET_1.CONFIG_DIGEST),
        tooManySigners,
        10,
      )
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert if insufficient signers (n <= 3f)', async () => {
      // f=5, need n > 15, but only provide 15 signers
      const { configDigest } = createConfig(1, 16)
      const signers = FIXTURE_SET_1.SIGNER_ADDRESSES.slice(0, 15)
      const result = await sendSetConfig(owner, configDigest, signers, 5)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert if duplicate signing keys', async () => {
      const { configDigest } = createConfig(1, 16)
      const signers = [
        FIXTURE_SET_1.SIGNER_ADDRESSES[0],
        FIXTURE_SET_1.SIGNER_ADDRESSES[1],
        FIXTURE_SET_1.SIGNER_ADDRESSES[2],
        FIXTURE_SET_1.SIGNER_ADDRESSES[0], // duplicate
      ]
      const result = await sendSetConfig(owner, configDigest, signers, 1)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert if zero address signer', async () => {
      const { configDigest } = createConfig(1, 16)
      const signers = [
        FIXTURE_SET_1.SIGNER_ADDRESSES[0],
        FIXTURE_SET_1.SIGNER_ADDRESSES[1],
        FIXTURE_SET_1.SIGNER_ADDRESSES[2],
        '0x0000000000000000000000000000000000000000',
      ]
      const result = await sendSetConfig(owner, configDigest, signers, 1)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert if config digest already set', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)
      const result = await sendSetConfig(owner, configDigest, signers, 5)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })
  })

  // ========================================================================
  // UpdateConfig tests
  // ========================================================================

  describe('UpdateConfig', () => {
    it('should update config successfully', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const newSigners = createConfig(1, 16).signers
      const result = await sendUpdateConfig(owner, configDigest, signers, newSigners, 5)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should revert if not owner', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const newSigners = createConfig(1, 16).signers
      const result = await sendUpdateConfig(nonOwner, configDigest, signers, newSigners, 5)
      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert if digest not set', async () => {
      const signers = createConfig(1, 16).signers
      const result = await sendUpdateConfig(
        owner,
        BigInt('0x1234567890abcdef1234567890abcdef12345678'),
        signers,
        signers,
        5,
      )
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })
  })

  // ========================================================================
  // ActivateConfig / DeactivateConfig tests
  // ========================================================================

  describe('ActivateConfig / DeactivateConfig', () => {
    it('should deactivate config successfully', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const result = await sendDeactivateConfig(owner, configDigest)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should activate config successfully', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)
      await sendDeactivateConfig(owner, configDigest)

      const result = await sendActivateConfig(owner, configDigest)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should revert deactivate if not owner', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const result = await sendDeactivateConfig(nonOwner, configDigest)
      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert activate if not owner', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const result = await sendActivateConfig(nonOwner, configDigest)
      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert deactivate if digest not set', async () => {
      const result = await sendDeactivateConfig(owner, BigInt('0xdeadbeef'))
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert activate if digest not set', async () => {
      const result = await sendActivateConfig(owner, BigInt('0xdeadbeef'))
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })
  })

  // ========================================================================
  // Ownership tests
  // ========================================================================

  describe('Ownership', () => {
    it('should transfer ownership successfully', async () => {
      const result = await sendTransferOwnership(owner, nonOwner.address)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })

      const pending = await verifier.getPendingOwner()
      expect(pending?.equals(nonOwner.address)).toBe(true)
    })

    it('should accept ownership successfully', async () => {
      await sendTransferOwnership(owner, nonOwner.address)

      const result = await sendAcceptOwnership(nonOwner)
      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })

      const newOwner = await verifier.getOwner()
      expect(newOwner.equals(nonOwner.address)).toBe(true)
    })

    it('should revert transfer if not owner', async () => {
      const result = await sendTransferOwnership(nonOwner, owner.address)
      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert accept if not pending owner', async () => {
      const thirdParty = await blockchain.treasury('thirdParty')
      await sendTransferOwnership(owner, nonOwner.address)

      const result = await sendAcceptOwnership(thirdParty)
      expect(result.transactions).toHaveTransaction({
        from: thirdParty.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert transfer to self', async () => {
      const result = await sendTransferOwnership(owner, owner.address)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('current owner can call privileged functions during pending transfer', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      await sendTransferOwnership(owner, nonOwner.address)

      const deactivateResult = await sendDeactivateConfig(owner, configDigest)
      expect(deactivateResult.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })

      const activateResult = await sendActivateConfig(owner, configDigest)
      expect(activateResult.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('old owner cannot call privileged functions after transfer', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      await sendTransferOwnership(owner, nonOwner.address)
      await sendAcceptOwnership(nonOwner)

      const result = await sendActivateConfig(owner, configDigest)
      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('new owner can call privileged functions after transfer', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      await sendTransferOwnership(owner, nonOwner.address)
      await sendAcceptOwnership(nonOwner)

      const result = await sendDeactivateConfig(nonOwner, configDigest)
      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })
    })
  })

  // ========================================================================
  // Verify tests
  // ========================================================================

  describe('Verify', () => {
    it('should verify successfully with f+1 signers', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      // f+1 = 6 signers (indices 0..5)
      const selectedSigners = signerSubset(getFixtureSet(1), 0, 5)
      const payload = createSignedReport(1, selectedSigners)
      const result = await sendVerify(nonOwner, payload)

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should verify real production report', async () => {
      const configDigest = BigInt(REAL_REPORT.DIGEST)
      await sendSetConfig(owner, configDigest, REAL_REPORT.PUBLIC_KEYS, REAL_REPORT.F)

      const payload = hexToBytes(REAL_REPORT.PAYLOAD)
      const result = await sendVerify(nonOwner, payload)

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should revert if verified with incorrect addresses', async () => {
      const { configDigest, signers: signersSet1 } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signersSet1, 5)

      // Report signed by set 2 signers, context from set 1 -> unauthorized signers
      const selectedSignersSet2 = signerSubset(getFixtureSet(2), 0, 5)
      const payload = createSignedReportCustomSigners(1, selectedSignersSet2)
      const result = await sendVerify(nonOwner, payload)

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert if mismatched signature length', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const selectedSigners = signerSubset(getFixtureSet(1), 0, 5)
      const payload = createSignedReportMismatched(1, selectedSigners)
      const result = await sendVerify(nonOwner, payload)

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert if config digest not set', async () => {
      // No config set at all
      const selectedSigners = signerSubset(getFixtureSet(1), 0, 5)
      const payload = createSignedReport(1, selectedSigners)
      const result = await sendVerify(nonOwner, payload)

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert if digest inactive', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)
      await sendDeactivateConfig(owner, configDigest)

      const selectedSigners = signerSubset(getFixtureSet(1), 0, 5)
      const payload = createSignedReportCustomSigners(1, selectedSigners)
      const result = await sendVerify(nonOwner, payload)

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should succeed after reactivating config', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const selectedSigners = signerSubset(getFixtureSet(1), 0, 5)
      const payload = createSignedReport(1, selectedSigners)

      const result1 = await sendVerify(nonOwner, payload)
      expect(result1.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })

      await sendDeactivateConfig(owner, configDigest)
      await sendActivateConfig(owner, configDigest)

      const result2 = await sendVerify(nonOwner, payload)
      expect(result2.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should revert with wrong number of signers (too few)', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      // f=5, need f+1=6, but only provide 5
      const selectedSigners = signerSubset(getFixtureSet(1), 0, 4)
      const payload = createSignedReportCustomSigners(1, selectedSigners)
      const result = await sendVerify(nonOwner, payload)

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert with too many signatures', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      // f+2 = 7 signers
      const selectedSigners = signerSubset(getFixtureSet(1), 0, 6)
      const payload = createSignedReport(1, selectedSigners)
      const result = await sendVerify(nonOwner, payload)

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert with too few signatures', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      // 5 signers (one less than f+1=6)
      const selectedSigners = signerSubset(getFixtureSet(1), 0, 4)
      const payload = createSignedReport(1, selectedSigners)
      const result = await sendVerify(nonOwner, payload)

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should verify with same updated signers', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const selectedSigners = signerSubset(getFixtureSet(1), 0, 5)
      const payload = createSignedReport(1, selectedSigners)
      const result = await sendVerify(owner, payload)

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should succeed with multiple configs', async () => {
      const { configDigest: cd1, signers: signers1 } = createConfig(1, 16)
      await sendSetConfig(owner, cd1, signers1, 5)

      const { configDigest: cd2, signers: signers2 } = createConfig(2, 16)
      await sendSetConfig(owner, cd2, signers2, 5)

      const selectedSigners1 = signerSubset(getFixtureSet(1), 0, 5)
      const payload1 = createSignedReport(1, selectedSigners1)
      const result1 = await sendVerify(nonOwner, payload1)
      expect(result1.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })

      const selectedSigners2 = signerSubset(getFixtureSet(2), 0, 5)
      const payload2 = createSignedReport(2, selectedSigners2)
      const result2 = await sendVerify(nonOwner, payload2)
      expect(result2.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should revert with duplicate signers', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      // 6 copies of the same signer
      const firstKey = FIXTURE_SET_1.SIGNER_ADDRESSES[0]
      const duplicateSigners = Array(6).fill(firstKey)
      const payload = createSignedReportCustomSigners(1, duplicateSigners)
      const result = await sendVerify(owner, payload)

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should revert with partial duplicate signers', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const mixedSigners = [
        FIXTURE_SET_1.SIGNER_ADDRESSES[0],
        FIXTURE_SET_1.SIGNER_ADDRESSES[1],
        FIXTURE_SET_1.SIGNER_ADDRESSES[2],
        FIXTURE_SET_1.SIGNER_ADDRESSES[3],
        FIXTURE_SET_1.SIGNER_ADDRESSES[0], // duplicate
        FIXTURE_SET_1.SIGNER_ADDRESSES[0], // duplicate
      ]
      const payload = createSignedReportCustomSigners(1, mixedSigners)
      const result = await sendVerify(owner, payload)

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should verify after reducing signer count via update', async () => {
      const { configDigest, signers: initialSigners } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, initialSigners, 5)

      // Reduce to 12 signers with f=3
      const smallerSigners = createConfig(1, 12).signers
      await sendUpdateConfig(owner, configDigest, initialSigners, smallerSigners, 3)

      // Verify with f+1=4 signers from the smaller set
      const selectedSigners = signerSubset(getFixtureSet(1), 0, 3)
      const payload = createSignedReport(1, selectedSigners)
      const result = await sendVerify(owner, payload)

      expect(result.transactions).toHaveTransaction({
        from: owner.address,
        to: verifier.address,
        success: true,
      })
    })
  })

  // ========================================================================
  // UpdateConfig + Verify interaction tests
  // ========================================================================

  describe('UpdateConfig + Verify', () => {
    it('should verify with new config after same-size signer set update', async () => {
      const { configDigest, signers } = createConfig(1, 16)
      await sendSetConfig(owner, configDigest, signers, 5)

      const sameSigners = createConfig(1, 16).signers
      await sendUpdateConfig(owner, configDigest, signers, sameSigners, 5)

      const selectedSigners = signerSubset(getFixtureSet(1), 0, 5)
      const payload = createSignedReport(1, selectedSigners)
      const result = await sendVerify(nonOwner, payload)

      expect(result.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should verify with larger signer set after update', async () => {
      const { configDigest, signers: initialSigners } = createConfig(1, 12)
      await sendSetConfig(owner, configDigest, initialSigners, 3)

      const initialSelectedSigners = signerSubset(getFixtureSet(1), 0, 3)
      const initialPayload = createSignedReportCustomSigners(1, initialSelectedSigners)
      const initialResult = await sendVerify(nonOwner, initialPayload)
      expect(initialResult.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })

      // Expand to 16 signers, f=5
      const expandedSigners = createConfig(1, 16).signers
      await sendUpdateConfig(owner, configDigest, initialSigners, expandedSigners, 5)

      const expandedSelectedSigners = signerSubset(getFixtureSet(1), 0, 5)
      const expandedPayload = createSignedReport(1, expandedSelectedSigners)
      const expandedResult = await sendVerify(nonOwner, expandedPayload)
      expect(expandedResult.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })
    })

    it('should fail with insufficient signatures after f update', async () => {
      const { configDigest, signers: initialSigners } = createConfig(1, 12)
      await sendSetConfig(owner, configDigest, initialSigners, 3)

      // Verify with initial config (f+1=4 signers)
      const initialSelectedSigners = signerSubset(getFixtureSet(1), 0, 3)
      const initialPayload = createSignedReportCustomSigners(1, initialSelectedSigners)
      const initialResult = await sendVerify(nonOwner, initialPayload)
      expect(initialResult.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })

      // Update to f=5
      const expandedSigners = createConfig(1, 16).signers
      await sendUpdateConfig(owner, configDigest, initialSigners, expandedSigners, 5)

      // Old count (4 signers) should fail since new f=5 requires 6
      const insufficientSigners = signerSubset(getFixtureSet(1), 0, 3)
      const insufficientPayload = createSignedReport(1, insufficientSigners)
      const insufficientResult = await sendVerify(nonOwner, insufficientPayload)
      expect(insufficientResult.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })

    it('should fail with old signers after update to different signer set', async () => {
      const configDigest = BigInt(FIXTURE_SET_1.CONFIG_DIGEST)
      const first8Set1 = FIXTURE_SET_1.SIGNER_ADDRESSES.slice(0, 8)
      await sendSetConfig(owner, configDigest, first8Set1, 2)

      const initialSelectedSigners = first8Set1.slice(0, 3)
      const initialPayload = createSignedReport(1, initialSelectedSigners)
      const initialResult = await sendVerify(nonOwner, initialPayload)
      expect(initialResult.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: true,
      })

      // Update to signers from set 2
      const first8Set2 = FIXTURE_SET_2.SIGNER_ADDRESSES.slice(0, 8)
      await sendUpdateConfig(owner, configDigest, first8Set1, first8Set2, 2)

      // Try with old set 1 signers - should fail
      const oldSigners = first8Set1.slice(0, 3)
      const oldPayload = createSignedReportCustomSigners(1, oldSigners)
      const oldResult = await sendVerify(nonOwner, oldPayload)
      expect(oldResult.transactions).toHaveTransaction({
        from: nonOwner.address,
        to: verifier.address,
        success: false,
      })
    })
  })
})
