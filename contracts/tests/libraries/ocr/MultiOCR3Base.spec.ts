import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Cell } from '@ton/core'
import {
  MerkleMultiProofCalculator,
  MerkleMultiProofCalculatorStorage,
} from '../../../wrappers/libraries/merkle_proof/MerkleMultiProofCalculator'
import { sha256_sync } from '@ton/crypto'

import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import { OCR3_PLUGIN_TYPE_COMMIT, equalsConfig, OCR3Base } from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import { OCR3BaseExample } from '../../../wrappers/examples/ocr/OCR3Base'

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

})

