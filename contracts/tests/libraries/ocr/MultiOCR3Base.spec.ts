import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, toNano} from '@ton/core'
import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import { OCR3_PLUGIN_TYPE_COMMIT, OCR3_PLUGIN_TYPE_EXECUTE, SignatureEd25519, createSignature, equalsConfig} from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import * as ExitCodes from  '../../../wrappers/libraries/ocr/ExitCodes'
import { OCR3BaseExample } from '../../../wrappers/examples/ocr/OCR3Base'
import { generateRandomAddresses, generateRandomMockAddresses, generateRandomMockSigners, generateRandomSigners } from './helpers'

describe('OCR3Base Tests', () => {
  let blockchain: Blockchain
  let ocr3Base: SandboxContract<OCR3BaseExample>

  let deployer: SandboxContract<TreasuryContract>

  let transmitter1: SandboxContract<TreasuryContract>;
  let transmitter2: SandboxContract<TreasuryContract>;
  let transmitter3: SandboxContract<TreasuryContract>;
  let transmitter4: SandboxContract<TreasuryContract>;

  const configDigest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden
  const signer1: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn
  const signer2: bigint = 0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210n
  const signer3: bigint = 0x1122334455667788990011223344556677889900112233445566778899001122n
  const signer4: bigint = 0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899n

  const reportBytes =
            0x2b851c4684929f0c20865dcacbd6afb6a2288daa164caf75517009a289fa3135281fb1e4800b11bc2b851c4684929f0c15a9c133ee53500a0100000000000000000000000000000014d87929a32cf0cbdc9e2d07ffc7c33344079de7271268656c6c6f20434349505265636569766572bd8a1fb0af25dc8700d2d302cfbae718c3b2c3c61cfe47f58a45b1126c006490a086010000000000000000000000000000000000000000000000000000000000000000n

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    const code = await compile('OCR3Base')
    ocr3Base = blockchain.openContract(OCR3BaseExample.create(code))

    deployer = await blockchain.treasury('deployer')
    transmitter1 = await blockchain.treasury('transmitter1')
    transmitter2 = await blockchain.treasury('transmitter2')
    transmitter3 = await blockchain.treasury('transmitter3')
    transmitter4 = await blockchain.treasury('transmitter4')
    
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
    const signers = [signer1, signer2, signer3, signer4];
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
      signers: [signer1, signer2, signer3, signer4],
      transmitters: [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address]
    }

    expect(equalsConfig(config, expectedConfig)).toBeTruthy()
  })


  it('Can set Commit and Execute configs independently', async () => {
    const config1 = {
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1, signer2, signer3, signer4],
      transmitters: [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address],
    };

    const config2 = {
      configDigest: configDigest + 1n,
      ocrPluginType: OCR3_PLUGIN_TYPE_EXECUTE,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer4, signer3, signer2, signer1],
      transmitters: [transmitter4.address, transmitter3.address, transmitter2.address, transmitter1.address],
    };

    await ocr3Base.sendSetOCR3Config(deployer.getSender(), { value: toNano('100'), ...config1 });
    await ocr3Base.sendSetOCR3Config(deployer.getSender(), { value: toNano('100'), ...config2 });

    const result1 = await ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_COMMIT);
    const result2 = await ocr3Base.getOCR3Config(OCR3_PLUGIN_TYPE_EXECUTE);

    expect(equalsConfig(result1, { configInfo: { configDigest: config1.configDigest, bigF: 1, n: 4, isSignatureVerificationEnabled: true }, signers: config1.signers, transmitters: config1.transmitters })).toBeTruthy();
    expect(equalsConfig(result2, { configInfo: { configDigest: config2.configDigest, bigF: 1, n: 4, isSignatureVerificationEnabled: true }, signers: config2.signers, transmitters: config2.transmitters })).toBeTruthy();
  });

  it('SetOCR3Config Fails with invalid ocrPluginType', async () => {
    const invalidType = 999;
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: invalidType,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1, signer2, signer3, signer4],
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
      signers: [signer1, signer2, signer3, signer4],
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
      signers: [signer1, signer2, signer3, signer4],
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
      signers: [signer1, signer2, signer3, signer4],
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
    const signers = [signer1, signer2, signer3];
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
    const signers = [signer1, signer2, signer3, signer4];
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
      signers: [signer1, signer1, signer2, signer3],
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
      signers: [signer1, signer2, signer3, signer4],
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
      signers: [signer1, signer2, signer3, signer4],
      transmitters: [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address],
    });

    // Try changing isSignatureVerificationEnabled
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: false, // changed!
      signers: [signer1, signer2, signer3, signer4],
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
    const signers = [signer1, signer2, signer3, signer4];
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

    
    const sequenceBytes =0x01
    const reportBitLength = reportBytes.toString(2).length;
    const hashedReport = beginCell()
      .storeUint(reportBytes, reportBitLength)
      .storeUint(configDigest, 256)
      .storeUint(0, 192) //padding
      .storeUint(sequenceBytes, 64)
      .endCell()
      .hash()

    const signatures: SignatureEd25519[] = []  

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
        report: beginCell()
          .storeUint(reportBytes, reportBitLength)
          .endCell(),
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

