import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, toNano, Address } from '@ton/core'
import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import {
  OCR3_PLUGIN_TYPE_COMMIT,
  OCR3_PLUGIN_TYPE_EXECUTE,
  SignatureEd25519,
  createSignature,
  hashReport,
} from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import * as ExitCodes from '../../../wrappers/libraries/ocr/ExitCodes'
import { OCR3BaseLogTypes } from '../../../wrappers/libraries/ocr/Logs'
import { OCR3BaseExample } from '../../../wrappers/examples/ocr/OCR3Base'
import {
  generateRandomAddresses,
  generateRandomMockAddresses,
  generateRandomMockSigners,
  generateEd25519KeyPair,
  expectEqualsConfig,
} from './Helpers'
import { uint8ArrayToBigInt } from '../../../utils/Utils'
import { KeyPair } from '@ton/crypto'
import { assertLog } from './Logs'
import { expectFailedTransaction, expectSuccessfulTransaction } from '../../Logs'

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
  const hashedReport = hashReport(report, { configDigest, padding: 0n, sequenceBytes })

  beforeAll(async () => {
    code = await compile('OCR3Base')
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
    ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
    bigF: 1, isSignatureVerificationEnabled: true,
    signers: signersPublicKeys,
    transmitters: transmitters.map((t) => t.address),
    ...overrides,
  })

  const setOCR3Config = async (config = {}) => {
    return await ocr3Base.sendSetOCR3Config(deployer.getSender(), createDefaultConfig(config))
  }

  const createSignatures = (signerList: KeyPair[], hash = hashedReport): SignatureEd25519[] => {
    return signerList.map((signer) => createSignature(signer, hash))
  }

  const setupAndTransmit = async (
    transmitterIndex = 0,
    signerIndices = [0, 1],
    pluginType = OCR3_PLUGIN_TYPE_COMMIT,
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
    expectSuccessfulTransaction(result, deployer.address, ocr3Base.address)

    const config = await ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_COMMIT)
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

    assertLog(result.transactions, ocr3Base.address, OCR3BaseLogTypes.OCR3BaseConfigSet, {
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
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
    expectSuccessfulTransaction(result, deployer.address, ocr3Base.address)

    const newSigners: bigint[] = []
    for (let i = 0; i < 4; i++) {
      const newSigner = await generateEd25519KeyPair()
      newSigners.push(uint8ArrayToBigInt(newSigner.publicKey))
    }

    const updateConfigResult = await setOCR3Config({
      signers: newSigners,
      transmitters: transmitters.slice(2, 4).map((t) => t.address),
    })
    expectSuccessfulTransaction(updateConfigResult, deployer.address, ocr3Base.address)

    const newConfig = await ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_COMMIT)
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
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
    }

    const config2 = {
      configDigest: configDigest + 1n,
      ocrPluginType: OCR3_PLUGIN_TYPE_EXECUTE,
      signers: [...signersPublicKeys].reverse(),
      transmitters: [...transmitters].reverse().map((t) => t.address),
    }

    await setOCR3Config(config1)
    await setOCR3Config(config2)

    const [result1, result2] = await Promise.all([
      ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_COMMIT),
      ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_EXECUTE),
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
    expectFailedTransaction(
      result,
      deployer.address,
      ocr3Base.address,
      ExitCodes.ERROR_NON_EXISTENT_OCR_PLUGIN_TYPE,
    )
  })

  it('SetOCR3Config Fails when bigF is zero', async () => {
    const result = await setOCR3Config({
      bigF: 0,
      transmitters: [transmitters[0].address],
    })
    expectFailedTransaction(
      result,
      deployer.address,
      ocr3Base.address,
      ExitCodes.ERROR_BIG_F_MUST_BE_POSITIVE,
    )
  })

  it('SetOCR3Config Fails when transmitters length is more than MAX_NUM_ORACLES', async () => {
    const result = await setOCR3Config({
      transmitters: generateRandomMockAddresses(256),
    })
    expectFailedTransaction(
      result,
      deployer.address,
      ocr3Base.address,
      ExitCodes.ERROR_TOO_MANY_TRANSMITTERS,
    )
  }, 20000)

  it('SetOCR3Config Fails when transmitters is empty', async () => {
    const result = await setOCR3Config({ transmitters: [] })
    expectFailedTransaction(
      result,
      deployer.address,
      ocr3Base.address,
      ExitCodes.ERROR_NO_TRANSMITTERS,
    )
  })

  it('SetOCR3Config Fails when signers length is more than MAX_NUM_ORACLES', async () => {
    const result = await setOCR3Config({
      signers: generateRandomMockSigners(256),
      transmitters: [transmitters[0].address],
    })
    expectFailedTransaction(
      result,
      deployer.address,
      ocr3Base.address,
      ExitCodes.ERROR_TOO_MANY_SIGNERS,
    )
  }, 20000)

  it('SetOCR3Config Fails when signers is empty', async () => {
    const result = await setOCR3Config({
      signers: [],
      transmitters: [transmitters[0].address],
    })
    expectFailedTransaction(result, deployer.address, ocr3Base.address, ExitCodes.ERROR_NO_SIGNERS)
  })

  it('SetOCR3Config Fails when signers.length <= 3 * bigF', async () => {
    const result = await setOCR3Config({
      signers: signersPublicKeys.slice(0, 3),
      transmitters: [transmitters[0].address],
    })
    expectFailedTransaction(
      result,
      deployer.address,
      ocr3Base.address,
      ExitCodes.ERROR_BIG_F_TOO_HIGH,
    )
  })

  it('SetOCR3Config Fails when signers length is less than transmitters length', async () => {
    const manyTransmitters = await generateRandomAddresses(5)
    const result = await setOCR3Config({ transmitters: manyTransmitters })
    expectFailedTransaction(
      result,
      deployer.address,
      ocr3Base.address,
      ExitCodes.ERROR_TOO_MANY_TRANSMITTERS,
    )
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
    expectFailedTransaction(
      result,
      deployer.address,
      ocr3Base.address,
      ExitCodes.ERROR_REPEATED_SIGNERS,
    )
  })

  it('SetOCR3Config Fails when there are repeated transmitters', async () => {
    const result = await setOCR3Config({
      transmitters: [transmitters[0].address, transmitters[0].address],
    })
    expectFailedTransaction(
      result,
      deployer.address,
      ocr3Base.address,
      ExitCodes.ERROR_REPEATED_TRANSMITTERS,
    )
  })

  it('SetOCR3Config Fails when trying to change isSignatureVerificationEnabled after initial set', async () => {
    await setOCR3Config()

    const result = await setOCR3Config({ isSignatureVerificationEnabled: false })
    expectFailedTransaction(
      result,
      deployer.address,
      ocr3Base.address,
      ExitCodes.ERROR_STATIC_CONFIG_CANNOT_BE_CHANGED,
    )
  })

  it('Test Transmit function works with authorized transmitter', async () => {
    const result = await setupAndTransmit()
    expectSuccessfulTransaction(result, transmitters[0].address, ocr3Base.address)

    assertLog(result.transactions, ocr3Base.address, OCR3BaseLogTypes.OCR3BaseTransmitted, {
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
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
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures,
    })

    expectFailedTransaction(
      result,
      transmitters[2].address,
      ocr3Base.address,
      ExitCodes.ERROR_UNAUTHORIZED_TRANSMITTER,
    )
  })

  it('Transmit fails with signatures from unauthorized signers', async () => {
    await setOCR3Config({ transmitters: [transmitters[0].address] })

    const unauthorizedSigner = await generateEd25519KeyPair()
    const unauthorizedSignature = createSignature(unauthorizedSigner, hashedReport)
    const validSignature = createSignature(signers[0], hashedReport)

    const result = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures: [validSignature, unauthorizedSignature],
    })

    expectFailedTransaction(
      result,
      transmitters[0].address,
      ocr3Base.address,
      ExitCodes.ERROR_UNAUTHORIZED_SIGNER,
    )
  })

  it('Transmit fails with repeated signatures', async () => {
    await setOCR3Config({ transmitters: [transmitters[0].address] })

    const sig = createSignature(signers[0], hashedReport)
    const result = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures: [sig, sig], // Repeated
    })

    expectFailedTransaction(
      result,
      transmitters[0].address,
      ocr3Base.address,
      ExitCodes.ERROR_NON_UNIQUE_SIGNATURES,
    )
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
      createSignature(signers[0], wrongHashedReport),
      createSignature(signers[1], wrongHashedReport),
    ]

    const result = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest: wrongDigest, padding: 0n, sequenceBytes },
      report,
      signatures,
    })

    expectFailedTransaction(
      result,
      transmitters[0].address,
      ocr3Base.address,
      ExitCodes.ERROR_CONFIG_DIGEST_MISMATCH,
    )
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

    expectFailedTransaction(
      result,
      transmitters[0].address,
      ocr3Base.address,
      ExitCodes.ERROR_NON_EXISTENT_OCR_PLUGIN_TYPE,
    )
  })

  it('Transmit fails when signatures.length is not bigF + 1', async () => {
    await setOCR3Config({ transmitters: [transmitters[0].address] })

    const onlyOneSig = createSignature(signers[0], hashedReport)
    const result = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures: [onlyOneSig], // Needs 2 (bigF+1)
    })

    expectFailedTransaction(
      result,
      transmitters[0].address,
      ocr3Base.address,
      ExitCodes.ERROR_WRONG_NUMBER_OF_SIGNATURES,
    )
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
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures: oldSignatures,
    })

    expectFailedTransaction(
      resultWithOldSigners,
      transmitters[0].address,
      ocr3Base.address,
      ExitCodes.ERROR_UNAUTHORIZED_SIGNER,
    )

    // New signers should be able to sign
    const newSignatures = [
      createSignature(newSigners[0], hashedReport),
      createSignature(newSigners[1], hashedReport),
    ]
    const resultWithNewSigners = await ocr3Base.sendTransmit(transmitters[0].getSender(), {
      value: toNano('0.05'),
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
      signatures: newSignatures,
    })

    expectSuccessfulTransaction(resultWithNewSigners, transmitters[0].address, ocr3Base.address)

    assertLog(
      resultWithNewSigners.transactions,
      ocr3Base.address,
      OCR3BaseLogTypes.OCR3BaseTransmitted,
      {
        ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
        configDigest,
        sequenceNumber: sequenceBytes,
      },
    )
  })
})
