import "../wrappers/libraries/MultiOCR3BaseExample";

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Dictionary } from '@ton/core'
import { MerkleMultiProofCalculator } from '../wrappers/libraries/MerkleMultiProofCalculator'
import { sha256_sync } from '@ton/crypto'

import '@ton/test-utils'
import { MultiOCR3BaseExample } from "../wrappers/libraries/MultiOCR3BaseExample";


const CHAIN_ID = 100;
const OCR_PLUGIN_TYPE_COMMIT = 0;
const OCR_PLUGIN_TYPE_EXECUTION = 1;


describe('MerkleMultiProofCalculatorDict', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let multiOCR3Base: SandboxContract<MultiOCR3BaseExample>

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    multiOCR3Base = blockchain.openContract(await MultiOCR3BaseExample.fromInit())
    deployer = await blockchain.treasury('deployer')

    const deployResult = await multiOCR3Base.send(
      deployer.getSender(),
      {
        value: toNano('0.05'),
      },
      null
    ) 
})
})

