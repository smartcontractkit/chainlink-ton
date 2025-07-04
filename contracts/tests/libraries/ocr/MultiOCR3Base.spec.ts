import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Cell } from '@ton/core'
import {
  MerkleMultiProofCalculator,
  MerkleMultiProofCalculatorStorage,
} from '../../../wrappers/libraries/merkle_proof/MerkleMultiProofCalculator'
import { sha256_sync } from '@ton/crypto'

import '@ton/test-utils'
import { compile } from '@ton/blueprint'
import { OCR3Base } from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import { OCR3BaseExample } from '../../../wrappers/examples/ocr/OCR3Base'

describe('OCR3Base Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let ocr3BaseExample: SandboxContract<MerkleMultiProofCalculator>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    let code = await compile('OCR3Base')
    let ocr3Base = blockchain.openContract(OCR3BaseExample.create(code))
    
    deployer = await blockchain.treasury('deployer')
    const deployResult = await ocr3Base.sendDeploy(deployer.getSender(), toNano('0,05'))

    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: ocr3Base.address,
      deploy: true,
      success: true,
    })
  })

  it('Test SetOCR3Config with signers', async () => {
    
  })


  })


