import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, toNano} from '@ton/core'
import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import { OCR3_PLUGIN_TYPE_COMMIT, OCR3_PLUGIN_TYPE_EXECUTE, SignatureEd25519, createSignature} from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import * as ExitCodes from  '../../../wrappers/libraries/ocr/ExitCodes'
import { OCR3BaseExample } from '../../../wrappers/examples/ocr/OCR3Base'
import { generateRandomAddresses, generateRandomMockAddresses, generateRandomMockSigners, generateEd25519KeyPair, expectEqualsConfig } from './helpers'
import { uint8ArrayToBigInt } from '../../../utils/Utils'
import { KeyPair } from '@ton/crypto'

describe('OCR3Base Tests', () => {
  let blockchain: Blockchain
  let ocr3Base: SandboxContract<OCR3BaseExample>

  let code: Cell

  let deployer: SandboxContract<TreasuryContract>

  let transmitter1: SandboxContract<TreasuryContract>;
  let transmitter2: SandboxContract<TreasuryContract>;
  let transmitter3: SandboxContract<TreasuryContract>;
  let transmitter4: SandboxContract<TreasuryContract>;

  let signer1: KeyPair;
  let signer2: KeyPair;
  let signer3: KeyPair;
  let signer4: KeyPair;

  let signer1PublicKey: bigint;
  let signer2PublicKey: bigint;
  let signer3PublicKey: bigint;
  let signer4PublicKey: bigint;

  const configDigest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden

  // The actual content or structure of the report is not important for these tests.
  // This is a sample that will be used to test the transmit function, the only thing that matters
  // for this test is that it is serialized and hashed in the same way offchain and onchain.
  const someReportData = beginCell().storeUint(0x12345678, 32).endCell();
  const report = beginCell()
    .storeRef(someReportData)
    .storeUint(0x12345678, 32) 
    .endCell()

  beforeAll(async () => {
    code = await compile('OCR3Base')
    blockchain = await Blockchain.create()

    deployer = await blockchain.treasury('deployer')
    transmitter1 = await blockchain.treasury('transmitter1')
    transmitter2 = await blockchain.treasury('transmitter2')
    transmitter3 = await blockchain.treasury('transmitter3')
    transmitter4 = await blockchain.treasury('transmitter4')

    signer1 = await generateEd25519KeyPair() 
    signer2 = await generateEd25519KeyPair() 
    signer3 = await generateEd25519KeyPair() 
    signer4 = await generateEd25519KeyPair() 

    signer1PublicKey = uint8ArrayToBigInt(signer1.publicKey)
    signer2PublicKey = uint8ArrayToBigInt(signer2.publicKey)
    signer3PublicKey = uint8ArrayToBigInt(signer3.publicKey)
    signer4PublicKey = uint8ArrayToBigInt(signer4.publicKey)
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

  it('Test SetOCR3Config with signers', async () => {
    const bigF = 1;
    const signers = [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey];
    const transmitters = [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address];

    const result = await ocr3Base.sendSetOCR3Config(
      deployer.getSender(), 
      {
          value: toNano('100'),
          configDigest: configDigest,
          ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
          bigF: bigF,
          isSignatureVerificationEnabled: true,
          signers: signers,
          transmitters: transmitters
      }
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      success: true
    })

    const config = await ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_COMMIT)
    const expectedConfig = {
      configInfo: {
        configDigest: configDigest,
        bigF: bigF,
        n: 4, // Number of signers
        isSignatureVerificationEnabled: true
      },
      signers: [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey],
      transmitters: [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address]
    }

    expectEqualsConfig(config, expectedConfig)
  })

  it('Update already set config with SetOCR3Config ', async () => {
    const bigF = 1;
    const signers = [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey];
    const transmitters = [transmitter1.address, transmitter2.address];

    const result = await ocr3Base.sendSetOCR3Config(
      deployer.getSender(), 
      {
          value: toNano('100'),
          configDigest: configDigest,
          ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
          bigF: bigF,
          isSignatureVerificationEnabled: true,
          signers: signers,
          transmitters: transmitters
      }
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      success: true
    })

    const config = await ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_COMMIT)
    const expectedConfig = {
      configInfo: {
        configDigest: configDigest,
        bigF: bigF,
        n: 4, // Number of signers
        isSignatureVerificationEnabled: true
      },
      signers: [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey],
      transmitters: [transmitter1.address, transmitter2.address]
    }

    expectEqualsConfig(config, expectedConfig)

    const newSigners: bigint[] = []
    for (let i = 0; i < 4; i++) {
      const newSigner = await generateEd25519KeyPair()
      newSigners.push(uint8ArrayToBigInt(newSigner.publicKey))
    }

    const updateConfigResult = await ocr3Base.sendSetOCR3Config(
      deployer.getSender(),
      {
        value: toNano('100'),
        configDigest: configDigest,
        ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
        bigF: bigF,
        isSignatureVerificationEnabled: true,
        signers: newSigners,
        transmitters: [transmitter3.address, transmitter4.address]
      }
    )
    expect(updateConfigResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      success: true
    })

    const newExpectedConfig = {
      configInfo: {
        configDigest: configDigest,
        bigF: bigF,
        n: 4,
        isSignatureVerificationEnabled: true
      },
      signers: newSigners,
      transmitters: [transmitter3.address, transmitter4.address]
    }

    const newConfig = await ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_COMMIT)
    expectEqualsConfig(newExpectedConfig, newConfig)
  })


  it('Can set Commit and Execute configs independently', async () => {
    const config1 = {
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey],
      transmitters: [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address],
    };

    const config2 = {
      configDigest: configDigest + 1n,
      ocrPluginType: OCR3_PLUGIN_TYPE_EXECUTE,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer4PublicKey, signer3PublicKey, signer2PublicKey, signer1PublicKey],
      transmitters: [transmitter4.address, transmitter3.address, transmitter2.address, transmitter1.address],
    };

    await ocr3Base.sendSetOCR3Config(deployer.getSender(), { value: toNano('100'), ...config1 });
    await ocr3Base.sendSetOCR3Config(deployer.getSender(), { value: toNano('100'), ...config2 });

    const result1 = await ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_COMMIT);
    const result2 = await ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_EXECUTE);

    expectEqualsConfig(result1, { configInfo: { configDigest: config1.configDigest, bigF: 1, n: 4, isSignatureVerificationEnabled: true }, signers: config1.signers, transmitters: config1.transmitters })
    expectEqualsConfig(result2, { configInfo: { configDigest: config2.configDigest, bigF: 1, n: 4, isSignatureVerificationEnabled: true }, signers: config2.signers, transmitters: config2.transmitters })
  });

  it('SetOCR3Config Fails with invalid ocrPluginType', async () => {
    const invalidType = 999;
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: invalidType,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey],
      transmitters: [transmitter1.address],
    });

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_NON_EXISTENT_OCR_PLUGIN_TYPE,
      success: false,
    });
  });

  it('SetOCR3Config Fails when bigF is zero', async () => {
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 0,
      isSignatureVerificationEnabled: true,
      signers: [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey],
      transmitters: [transmitter1.address],
    });

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_BIG_F_MUST_BE_POSITIVE,
      success: false,
    });
  });

  it('SetOCR3Config Fails when transmitters length is more than MAX_NUM_ORACLES', async () => {
    const transmitters = await generateRandomMockAddresses(256)
    console.log('generated random transmitters')
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey],
      transmitters: transmitters,
    });

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_TOO_MANY_TRANSMITTERS,
      success: false,
    })
    },
  20000
  )

  it('SetOCR3Config Fails when transmitters is empty', async () => {
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey],
      transmitters: [],
    });
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_NO_TRANSMITTERS,
      success: false,
    });
  })

  it('SetOCR3Config Fails when signers length is more than MAX_NUM_ORACLES', async () => {
    const signers = await generateRandomMockSigners(256)
    console.log('generated random signers')
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: signers,
      transmitters: [transmitter1.address],
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_TOO_MANY_SIGNERS,
      success: false,
    })
    },
    20000
  )

  it('SetOCR3Config Fails when signers is empty', async () => {
    const signers: bigint[] = [];
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: signers,
      transmitters: [transmitter1.address],
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_NO_SIGNERS,
      success: false,
    })
  })

  it('SetOCR3Config Fails when signers.length <= 3 * bigF', async () => {
    const signers = [signer1PublicKey, signer2PublicKey, signer3PublicKey];
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: signers,
      transmitters: [transmitter1.address],
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_BIG_F_TOO_HIGH,
      success: false,
    })
  })

  it('SetOCR3Config Fails when signers length is less than transmitters length', async () => {
    const signers = [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey];
    const transmitters = await generateRandomAddresses(5);
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: signers,
      transmitters: transmitters,
    });
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_TOO_MANY_TRANSMITTERS,
      success: false,
    })
  })

  it('SetOCR3Config Fails when there are repeated signers', async () => {
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1PublicKey, signer1PublicKey, signer2PublicKey, signer3PublicKey],
      transmitters: [transmitter1.address],
    });

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_REPEATED_SIGNERS,
      success: false,
    });
  });

  it('SetOCR3Config Fails when there are repeated transmitters', async () => {
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey],
      transmitters: [transmitter1.address, transmitter1.address],
    });
    
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_REPEATED_TRANSMITTERS,
      success: false,
    });
  })


  it('SetOCR3Config Fails when trying to change isSignatureVerificationEnabled after initial set', async () => {
    // First, set a valid config
    await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey],
      transmitters: [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address],
    });

    // Try changing isSignatureVerificationEnabled
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: false, // changed!
      signers: [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey],
      transmitters: [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address],
    });

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      exitCode: ExitCodes.ERROR_STATIC_CONFIG_CANNOT_BE_CHANGED,
      success: false,
    });
  });


  it('Test Transmit function works with authorized transmitter', async () => {
    const bigF = 1;
    const signersPublicKeys = [signer1PublicKey, signer2PublicKey, signer3PublicKey, signer4PublicKey];
    const transmitters = [transmitter1.address, transmitter2.address];

    const result = await ocr3Base.sendSetOCR3Config(
      deployer.getSender(), 
      {
          value: toNano('100'),
          configDigest: configDigest,
          ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
          bigF: bigF,
          isSignatureVerificationEnabled: true,
          signers: signersPublicKeys,
          transmitters: transmitters
      }
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      success: true
    })

    const sequenceBytes =0x01
    const hashedReport = beginCell()
      .storeRef(report)
      .storeUint(configDigest, 256)
      .storeUint(0, 192) //padding
      .storeUint(sequenceBytes, 64)
      .endCell()
      .hash()

    const signatures: SignatureEd25519[] = []  

    const signers = [signer1, signer2]
    for (let i = 0; i < signers.length; i++) {
      const signature = createSignature(signers[i], hashedReport);
      signatures.push(signature);
    }

    const transmitResult = await ocr3Base.sendTransmit(
      transmitter1.getSender(), 
      {
        value: toNano('0.05'),
        ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
        reportContext: {
          configDigest: configDigest,
          sequenceBytes: sequenceBytes
        },
        report: report,
        signatures: signatures
      }
    )

    expect(transmitResult.transactions).toHaveTransaction({
      from: transmitter1.address,
      to: ocr3Base.address,
      success: true
    })
  })
})

