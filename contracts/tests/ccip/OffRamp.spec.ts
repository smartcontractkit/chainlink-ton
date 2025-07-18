import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Address, Cell, Dictionary, Message, beginCell } from '@ton/core'
import { compile } from '@ton/blueprint'
import { Router, RouterStorage } from '../../wrappers/ccip/Router'
import { OnRamp, OnRampStorage } from '../../wrappers/ccip/OnRamp'
import { OffRamp, OffRampStorage } from '../../wrappers/ccip/OffRamp'
import {
  FeeQuoter,
  FeeQuoterStorage,
} from '../../wrappers/tests/mocks/FeeQuoter'
import { testLog, getExternals, expectSuccessfulTransaction } from '../Logs'
import '@ton/test-utils'
import { uint8ArrayToBigInt, ZERO_ADDRESS } from '../../utils/Utils'
import { KeyPair } from '@ton/crypto'
import { expectEqualsConfig, generateEd25519KeyPair } from '../libraries/ocr/Helpers'
import { OCR3_PLUGIN_TYPE_COMMIT } from '../../wrappers/libraries/ocr/MultiOCR3Base'
import * as Logs from '../libraries/ocr/Logs'
import { OCR3BaseLogTypes } from '../../wrappers/libraries/ocr/Logs'

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n
const CHAINSEL_TON = 13879075125137744094n

function generateSecureRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => ('0' + (byte % 36).toString(36)).slice(-1)).join('');
}


describe('OffRamp', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<OffRamp>
  let feeQuoter: SandboxContract<FeeQuoter>
  let deployerCode: Cell 
  let merkleRootCodeRaw: Cell
  let transmitters: SandboxContract<TreasuryContract>[]
  let signers: KeyPair[]
  let signersPublicKeys: bigint[]

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    deployerCode = await compile('Deployable')
    merkleRootCodeRaw = await compile('MerkleRoot')

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

    // Populate the emulator library code
    // https://docs.ton.org/v3/documentation/data-formats/tlb/library-cells#testing-in-the-blueprint
    const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
    _libs.set(BigInt(`0x${merkleRootCodeRaw.hash().toString('hex')}`), merkleRootCodeRaw)
    const libs = beginCell().storeDictDirect(_libs).endCell()
    blockchain.libs = libs

    // setup mock fee quoter
    {
      let code = await compile('FeeQuoter')
      feeQuoter = blockchain.openContract(FeeQuoter.create(code))
      let result = await feeQuoter.sendDeploy(deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: feeQuoter.address,
        deploy: true,
        success: true,
      })
    }
   })

   beforeEach(async () => {

    // Using a different deployer changes the value of owner
    // and gets us a contract with a different address every time
    const generateRandomDeployer = () => {
      const name = `deployer-${generateSecureRandomString(8)}`
      return blockchain.treasury(name)
    }

    deployer = await generateRandomDeployer()
    // setup offramp
    {
      let code = await compile('OffRamp')

      // Use a library reference
      let libPrep = beginCell().storeUint(2, 8).storeBuffer(merkleRootCodeRaw.hash()).endCell()
      let merkleRootCode = new Cell({ exotic: true, bits: libPrep.bits, refs: libPrep.refs })

      let data: OffRampStorage = {
        ownable: {
          owner: deployer.address,
        },
        deployerCode: deployerCode,
        merkleRootCode,
        feeQuoter: feeQuoter.address,
        chainSelector: CHAINSEL_TON,
        permissionlessExecutionThresholdSeconds: 60,
        latestPriceSequenceNumber: 0n,
      }

      offRamp = blockchain.openContract(OffRamp.createFromConfig(data, code))

      let result = await offRamp.sendDeploy(deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: offRamp.address,
        deploy: true,
        success: true,
      })
    }
  }, 60_000) // setup can take a while, since we deploy contracts

  it('should deploy', async () => {
    // the check is done inside beforeEach
    // blockchain and counter are ready to use
  })

  it('should handle SetOCR3Config', async () => {
    // Helper functions
    const configDigest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden
    const createDefaultConfig = (overrides = {}) => ({
      value: toNano('100'),
      configDigest,
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1, isSignatureVerificationEnabled: true,
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
      ...overrides,
    })

    const result = await offRamp.sendSetOCR3Config(
      deployer.getSender(),
      createDefaultConfig()
    )
    expectSuccessfulTransaction(result, deployer.address, offRamp.address)

    Logs.assertLog(result.transactions, offRamp.address, OCR3BaseLogTypes.OCR3BaseConfigSet, {
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      configDigest,
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
      bigF: 1,
    })
  })
})
