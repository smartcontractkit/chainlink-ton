import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import { KeyPair } from '@ton/crypto'
import { crc32 } from 'zlib'

import {
  generateEd25519KeyPair,
  generateRandomAddresses,
  generateRandomMockAddresses,
  generateRandomMockSigners,
  uint8ArrayToBigInt,
} from '../../../src/utils'
import { assertLog } from '../../Logs'
import { expectEqualsConfig } from './Helpers'
import { contractCode } from '../../../wrappers/codeLoader'
import { facilityId } from '../../../wrappers/utils'

import * as multiOCR3Base from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import { LogTypes as LogTypes } from '../../../wrappers/libraries/ocr/Logs'
import { OCR3BaseExample } from '../../../wrappers/examples/ocr/OCR3Base'

describe('OCR3Base Unit Tests', () => {
  it('should match facility ID', async () => {
    expect(multiOCR3Base.FACILITY_ID).toBe(facilityId(crc32(multiOCR3Base.FACILITY_NAME)))
  })
})

describe('OCR3Base Tests', () => {
  let blockchain: Blockchain
  let ocr3Base: SandboxContract<OCR3BaseExample>
  let code: Cell
  let deployer: SandboxContract<TreasuryContract>
  let transmitters: SandboxContract<TreasuryContract>[]
  let signers: KeyPair[]
  let signersPublicKeys: bigint[]

  // Test constants
  const configDigest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden
  const someReportData = beginCell().storeUint(0x12345678, 32).endCell()
  const report = beginCell().storeRef(someReportData).storeUint(0x12345678, 32).endCell()
  const sequenceBytes = 0x01
  const hashedReport = multiOCR3Base.hashReport(report, {
    configDigest,
    padding: 0n,
    sequenceBytes,
  })

  beforeAll(async () => {
    code = await contractCode.ccip.local('examples.OCR3Base')
    blockchain = await Blockchain.create()

    deployer = await blockchain.treasury('deployer')
    transmitters = await Promise.all([
      blockchain.treasury('transmitter1'),
      blockchain.treasury('transmitter2'),
      blockchain.treasury('transmitter3'),
      blockchain.treasury('transmitter4'),
    ])

    signers = await Promise.all([
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
    ])

    signersPublicKeys = signers.map((signer) => uint8ArrayToBigInt(signer.publicKey))
  })

  beforeEach(async () => {
    ocr3Base = blockchain.openContract(OCR3BaseExample.create(code))
    const deployResult = await ocr3Base.sendDeploy(deployer.getSender(), toNano('0.05'))
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      deploy: true,
      success: true,
    })
  })

  // Helper functions
  const createDefaultConfig = (overrides = {}) => ({
    value: toNano('100'),
    configDigest,
    ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
    bigF: 1,
    isSignatureVerificationEnabled: true,
    signers: signersPublicKeys,
    transmitters: transmitters.map((t) => t.address),
    ...overrides,
  })

  const setOCR3Config = async (config = {}) => {
    return await ocr3Base.sendSetOCR3Config(deployer.getSender(), createDefaultConfig(config))
  }

  const createSignatures = (
    signerList: KeyPair[],
    hash = hashedReport,
  ): multiOCR3Base.SignatureEd25519[] => {
    return signerList.map((signer) => multiOCR3Base.createSignature(signer, hash))
  }

  const setupAndTransmit = async (
    transmitterIndex = 0,
    signerIndices = [0, 1],
    pluginType = multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
  ) => {
    await setOCR3Config({
      ocrPluginType: pluginType,
      transmitters: transmitters.slice(0, 2).map((t) => t.address),
    })

    const signatures = createSignatures(signerIndices.map((i) => signers[i]))

    return await ocr3Base.sendTransmit(transmitters[transmitterIndex].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: pluginType,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures,
    })
  }

  it('Test SetOCR3Config with signers', async () => {
    const result = await setOCR3Config()
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      success: true,
    })

    const config = await ocr3Base.getOCR3Config(multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT)
    const expectedConfig = {
      configInfo: {
        configDigest,
        bigF: 1,
        n: 4,
        isSignatureVerificationEnabled: true,
      },
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
    }

    expectEqualsConfig(config, expectedConfig)

    assertLog(result.transactions, ocr3Base.address, LogTypes.OCR3BaseConfigSet, {
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      configDigest,
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
      bigF: 1,
    })
  })

  it('Update already set config with SetOCR3Config', async () => {
    const result = await setOCR3Config({
      transmitters: transmitters.slice(0, 2).map((t) => t.address),
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      success: true,
    })

    const newSigners: bigint[] = []
    for (let i = 0; i < 4; i++) {
      const newSigner = await generateEd25519KeyPair()
      newSigners.push(uint8ArrayToBigInt(newSigner.publicKey))
    }

    const updateConfigResult = await setOCR3Config({
      signers: newSigners,
      transmitters: transmitters.slice(2, 4).map((t) => t.address),
    })
    expect(updateConfigResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      success: true,
    })

    const newConfig = await ocr3Base.getOCR3Config(multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT)
    const expectedConfig = {
      configInfo: {
        configDigest,
        bigF: 1,
        n: 4,
        isSignatureVerificationEnabled: true,
      },
      signers: newSigners,
      transmitters: transmitters.slice(2, 4).map((t) => t.address),
    }

    expectEqualsConfig(newConfig, expectedConfig)
  })

  it('Can set Commit and Execute configs independently', async () => {
    const config1 = {
      configDigest,
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
    }

    const config2 = {
      configDigest: configDigest + 1n,
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_EXECUTE,
      signers: [...signersPublicKeys].reverse(),
      transmitters: [...transmitters].reverse().map((t) => t.address),
    }

    await setOCR3Config(config1)
    await setOCR3Config(config2)

    const [result1, result2] = await Promise.all([
      ocr3Base.getOCR3Config(multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT),
      ocr3Base.getOCR3Config(multiOCR3Base.OCR3_PLUGIN_TYPE_EXECUTE),
    ])

    expectEqualsConfig(result1, {
      configInfo: {
        configDigest: config1.configDigest,
        bigF: 1,
        n: 4,
        isSignatureVerificationEnabled: true,
      },
      signers: config1.signers,
      transmitters: config1.transmitters,
    })
    expectEqualsConfig(result2, {
      configInfo: {
        configDigest: config2.configDigest,
        bigF: 1,
        n: 4,
        isSignatureVerificationEnabled: true,
      },
      signers: config2.signers,
      transmitters: config2.transmitters,
    })
  })

  it('SetOCR3Config Fails with invalid ocrPluginType', async () => {
    const result = await setOCR3Config({
      ocrPluginType: 999,
      transmitters: [transmitters[0].address],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.NonExistentOcrPluginType,
    })
  })

  it('SetOCR3Config Fails when bigF is zero', async () => {
    const result = await setOCR3Config({
      bigF: 0,
      transmitters: [transmitters[0].address],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.BigFMustBePositive,
    })
  })

  it('SetOCR3Config Fails when transmitters length is more than MAX_NUM_ORACLES', async () => {
    const result = await setOCR3Config({
      transmitters: generateRandomMockAddresses(256),
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.TooManyTransmitters,
    })
  }, 20000)

  it('SetOCR3Config Fails when transmitters is empty', async () => {
    const result = await setOCR3Config({ transmitters: [] })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.NoTransmitters,
    })
  })

  it('SetOCR3Config Fails when signers length is more than MAX_NUM_ORACLES', async () => {
    const result = await setOCR3Config({
      signers: generateRandomMockSigners(256),
      transmitters: [transmitters[0].address],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.TooManySigners,
    })
  }, 20000)

  it('SetOCR3Config Fails when signers is empty', async () => {
    const result = await setOCR3Config({
      signers: [],
      transmitters: [transmitters[0].address],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.NoSigners,
    })
  })

  it('SetOCR3Config Fails when signers.length <= 3 * bigF', async () => {
    const result = await setOCR3Config({
      signers: signersPublicKeys.slice(0, 3),
      transmitters: [transmitters[0].address],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.BigFTooHigh,
    })
  })

  it('SetOCR3Config Fails when signers length is less than transmitters length', async () => {
    const manyTransmitters = await generateRandomAddresses(5)
    const result = await setOCR3Config({ transmitters: manyTransmitters })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.TooManyTransmitters,
    })
  })

  it('SetOCR3Config Fails when there are repeated signers', async () => {
    const result = await setOCR3Config({
      signers: [
        signersPublicKeys[0],
        signersPublicKeys[0],
        signersPublicKeys[1],
        signersPublicKeys[2],
      ],
      transmitters: [transmitters[0].address],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.RepeatedSigners,
    })
  })

  it('SetOCR3Config Fails when there are repeated transmitters', async () => {
    const result = await setOCR3Config({
      transmitters: [transmitters[0].address, transmitters[0].address],
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.RepeatedTransmitters,
    })
  })

  it('SetOCR3Config Fails when trying to change isSignatureVerificationEnabled after initial set', async () => {
    await setOCR3Config()

    const result = await setOCR3Config({ isSignatureVerificationEnabled: false })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.StaticConfigCannotBeChanged,
    })
  })

  it('Test Transmit function works with authorized transmitter', async () => {
    const result = await setupAndTransmit()
    expect(result.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: ocr3Base.address,
      success: true,
    })

    assertLog(result.transactions, ocr3Base.address, LogTypes.OCR3BaseTransmitted, {
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      configDigest,
      sequenceNumber: sequenceBytes,
    })
  })

  it('Transmit fails with unauthorized transmitter', async () => {
    await setOCR3Config({
      transmitters: transmitters.slice(0, 2).map((t) => t.address),
    })

    const signatures = createSignatures([signers[0], signers[1]])
    const result = await ocr3Base.sendTransmit(transmitters[2].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures,
    })

    expect(result.transactions).toHaveTransaction({
      from: transmitters[2].address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.UnauthorizedTransmitter,
    })
  })

  it('Transmit fails with signatures from unauthorized signers', async () => {
    await setOCR3Config({ transmitters: [transmitters[0].address] })

    const unauthorizedSigner = await generateEd25519KeyPair()
    const unauthorizedSignature = multiOCR3Base.createSignature(unauthorizedSigner, hashedReport)
    const validSignature = multiOCR3Base.createSignature(signers[0], hashedReport)

    const result = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures: [validSignature, unauthorizedSignature],
    })

    expect(result.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.UnauthorizedSigner,
    })
  })

  it('Transmit fails with repeated signatures', async () => {
    await setOCR3Config({ transmitters: [transmitters[0].address] })

    const sig = multiOCR3Base.createSignature(signers[0], hashedReport)
    const result = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures: [sig, sig], // Repeated
    })

    expect(result.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.NonUniqueSignatures,
    })
  })

  it('Transmit fails with mismatched configDigest', async () => {
    await setOCR3Config({ transmitters: [transmitters[0].address] })

    const wrongDigest = 0xbadbadbadbadn
    const wrongHashedReport = beginCell()
      .storeRef(report)
      .storeUint(wrongDigest, 256)
      .storeUint(0, 192)
      .storeUint(sequenceBytes, 64)
      .endCell()
      .hash()

    const signatures = [
      multiOCR3Base.createSignature(signers[0], wrongHashedReport),
      multiOCR3Base.createSignature(signers[1], wrongHashedReport),
    ]

    const result = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest: wrongDigest, padding: 0n, sequenceBytes },
      report,
      signatures,
    })

    expect(result.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.ConfigDigestMismatch,
    })
  })

  it('Transmit fails with non existent OCR plugin type', async () => {
    await setOCR3Config({ transmitters: [transmitters[0].address] })

    const signatures = createSignatures([signers[0], signers[1]])
    const result = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: 0xffff,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures,
    })

    expect(result.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.NonExistentOcrPluginType,
    })
  })

  it('Transmit fails when signatures.length is not bigF + 1', async () => {
    await setOCR3Config({ transmitters: [transmitters[0].address] })

    const onlyOneSig = multiOCR3Base.createSignature(signers[0], hashedReport)
    const result = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures: [onlyOneSig], // Needs 2 (bigF+1)
    })

    expect(result.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.WrongNumberOfSignatures,
    })
  })

  it('Old signers cannot transmit after config update', async () => {
    await setOCR3Config({
      transmitters: transmitters.slice(0, 2).map((t) => t.address),
    })

    const newSigners: KeyPair[] = []
    for (let i = 0; i < 4; i++) {
      const newSigner = await generateEd25519KeyPair()
      newSigners.push(newSigner)
    }
    const newSignersPublicKeys: bigint[] = newSigners.map((signer) =>
      uint8ArrayToBigInt(signer.publicKey),
    )

    await setOCR3Config({
      signers: newSignersPublicKeys,
      transmitters: transmitters.slice(0, 2).map((t) => t.address),
    })

    // Old signers should not be able to sign
    const oldSignatures = createSignatures([signers[0], signers[1]])
    const resultWithOldSigners = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures: oldSignatures,
    })

    expect(resultWithOldSigners.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: ocr3Base.address,
      exitCode: multiOCR3Base.Errors.UnauthorizedSigner,
    })

    // New signers should be able to sign
    const newSignatures = [
      multiOCR3Base.createSignature(newSigners[0], hashedReport),
      multiOCR3Base.createSignature(newSigners[1], hashedReport),
    ]
    const resultWithNewSigners = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures: newSignatures,
    })

    expect(resultWithNewSigners.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: ocr3Base.address,
      success: true,
    })

    assertLog(resultWithNewSigners.transactions, ocr3Base.address, LogTypes.OCR3BaseTransmitted, {
      ocrPluginType: multiOCR3Base.OCR3_PLUGIN_TYPE_COMMIT,
      configDigest,
      sequenceNumber: sequenceBytes,
    })
  })
})
