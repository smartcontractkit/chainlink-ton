import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano} from '@ton/core'
import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import { OCR3_PLUGIN_TYPE_COMMIT, OCR3_PLUGIN_TYPE_EXECUTE, equalsConfig} from '../../../wrappers/libraries/ocr/MultiOCR3Base'
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

  const valid_config_digest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden
  const signer1: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn
  const signer2: bigint = 0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210n
  const signer3: bigint = 0x1122334455667788990011223344556677889900112233445566778899001122n
  const signer4: bigint = 0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899n

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

  it('Test SetOCR3Config', async () => {
    const bigF = 1;
    const signers = [signer1, signer2, signer3, signer4];
    const transmitters = [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address];

    const result = await ocr3Base.sendSetOCR3Config(
      deployer.getSender(), 
      {
          value: toNano('100'),
          configDigest: valid_config_digest,
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
        configDigest: valid_config_digest,
        bigF: bigF,
        n: 4, // Number of signers
        isSignatureVerificationEnabled: true
      },
      signers: [signer1, signer2, signer3, signer4],
      transmitters: [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address]
    }

    expect(equalsConfig(config, expectedConfig)).toBeTruthy()
  })


  it('Test sets two configs independently', async () => {
    const config1 = {
      configDigest: valid_config_digest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1, signer2, signer3, signer4],
      transmitters: [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address],
    };

    const config2 = {
      configDigest: valid_config_digest + 1n,
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

  it('Fails with invalid ocrPluginType', async () => {
    const invalidType = 999;
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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

  it('Fails when bigF is zero', async () => {
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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

  it('Fails when transmitters length is more than MAX_NUM_ORACLES', async () => {
    const transmitters = await generateRandomMockAddresses(256)
    console.log('generated random transmitters')
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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

  it('Fails when transmitters is empty', async () => {
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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

  it('Fails when signers length is more than MAX_NUM_ORACLES', async () => {
    const signers = await generateRandomMockSigners(256)
    console.log('generated random signers')
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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

  it('Fails when signers is empty', async () => {
    const signers: bigint[] = [];
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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

  it('Fails when signers.length <= 3 * bigF', async () => {
    const signers = [signer1, signer2, signer3];
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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

  it('Fails when signers length is less than transmitters length', async () => {
    const signers = [signer1, signer2, signer3, signer4];
    const transmitters = await generateRandomAddresses(5);
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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

  it('Fails when there are repeated signers', async () => {
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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

  it('Fails when there are repeated transmitters', async () => {
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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


  it('Fails when trying to change isSignatureVerificationEnabled after initial set', async () => {
    // First, set a valid config
    await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1,
      isSignatureVerificationEnabled: true,
      signers: [signer1, signer2, signer3, signer4],
      transmitters: [transmitter1.address, transmitter2.address, transmitter3.address, transmitter4.address],
    });

    // Try changing isSignatureVerificationEnabled
    const result = await ocr3Base.sendSetOCR3Config(deployer.getSender(), {
      value: toNano('100'),
      configDigest: valid_config_digest,
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
})

