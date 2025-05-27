import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, toNano, Dictionary} from '@ton/core'
import { MerkleMultiProofCalculatorDict} from '../build/MerkleProof/tact_MerkleMultiProofCalculatorDict'
import { keccak256 } from 'js-sha3'
import { sha256_sync } from '@ton/crypto'

import '@ton/test-utils'
import { MerkleHelper, HashFunction} from './helpers/MerkleMultiProof/MerkleMultiProofHelper'
import { listOfHashesAsDictionary, listOfHashesAsCell } from './helpers/MerkleMultiProof/ListOfHashes'


describe('MerkleMultiProofCalculatorDict', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let calculator: SandboxContract<MerkleMultiProofCalculatorDict>
  let merkleHelper: MerkleHelper
  let hashFunctionSha: HashFunction
  let hashFunctionKeccak: HashFunction

  beforeEach(async () => {
    blockchain = await Blockchain.create()

    calculator = blockchain.openContract(await MerkleMultiProofCalculatorDict.fromInit())

    deployer = await blockchain.treasury('deployer')

    hashFunctionSha = (s: Uint8Array) => { return new Uint8Array(sha256_sync(Buffer.from(s)))}
    hashFunctionKeccak = (s: Uint8Array) => { return new Uint8Array(keccak256.arrayBuffer(s)) }

    // Modify this initializaiton to generate instances with Sha256 or Keccak256
    merkleHelper = new MerkleHelper(hashFunctionKeccak)

    let leaves = listOfHashesAsDictionary([1337n])

    const deployResult = await calculator.send(
      deployer.getSender(),
      {
        value: toNano('0.05'),
      },
      {
        $$type: 'MerkleMultiProof',
        leaves: leaves,
        leavesLen: 1n,
        proofs: Dictionary.empty(),
        proofsLen: 0n,
        proofFlagBits: 0n,
      },
    )
    expect(deployResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: calculator.address,
      deploy: true,
      success: true,
    })
  })

  it('Test listOfhashesAsCell', () => {
    let leaves = listOfHashesAsCell([
      0x1n,
      0x2n,
      0x3n,
      0x4n,
      0x5n,
      0x6n,
      0x7n,
      0x8n,
    ])
    let slice = leaves.beginParse()
    expect(slice.loadUint(256)).toBe(1)
    expect(slice.loadUint(256)).toBe(2)
    expect(slice.loadUint(256)).toBe(3)
    slice = slice.loadRef().beginParse()
    expect(slice.loadUint(256)).toBe(4)
    expect(slice.loadUint(256)).toBe(5)
    expect(slice.loadUint(256)).toBe(6)
    slice = slice.loadRef().beginParse()
    expect(slice.loadUint(256)).toBe(7)
    expect(slice.loadUint(256)).toBe(8)
    expect(slice.loadUint(256)).toBe(0)
  })

  it('Single leaf should be returned as root', async () => {
    expect(await calculator.getGetRoot()).toBe(1337n)
  })

  it('Spec Sync', async () => {
    let leaves = [
      0xa20c0244af79697a4ef4e2378c9d5d14cbd49ddab3427b12594c7cfa67a7f240n,
      0x3de96afb24ce2ac45a5595aa13d1a5163ae0b3c94cef6b2dc306b5966f32dfa5n,
      0xacadf7b4d13cd57c5d25f1d27be39b656347fe8f8e0de8db9c76d979dff57736n,
      0xc21c26a709802fe1ae52a9cd8ad94d15bf142ded26314339cd87a13e5b468165n,
      0x55f6df03562738c9a6437cd9ad221c52b76906a175ae96188cff60e0a2a59933n,
      0x2dbbe66452e43fec839dc65d5945aad6433d410c65863eaf1d876e1e0b06343cn,
      0x8beab00297b94bf079fcd5893b0a33ebf6b0ce862cd06be07c87d3c63e1c4acfn,
      0xcabdd3ad25daeb1e0541042f2ea4cd177f54e67aa4a2c697acd4bb682e94de59n,
      0x7e01d497203685e99e34df33d55465c66b2253fa1630ee2fe5c4997968e4a6fan,
      0x1a03d013f1e2fa9cc04f89c7528ac3216e3e096a1185d7247304e97c59f9661fn,
    ]

    let proofs = [
      0xde96f24fcf9ddd20c803dc9c5fba7c478a5598a08a0faa5f032c65823b8e26a3n,
      0xe1303cffc3958a6b93e2dc04caf21f200ff5aa5be090c5013f37804b91488bc2n,
      0x90d80c76bccb44a91f4e16604976163aaa39e9a1588b0b24b33a61f1d4ba7bb5n,
      0x012a299b25539d513c8677ecf37968774e9e4b045e79737f48defd350224cdfdn,
      0x420a36c5a73f87d8fb98e70c48d0d6f9dd83f50b7b91416a6f5f91fac4db800fn,
      0x5857d8d1b56abcd7f863cedd3c3f8677256f54d675be61f05efa45d6495fc30an,
      0xbf176d20166fdeb72593ff97efec1ce6244af41ca46cf0bc902d19d50c446f7bn,
      0xa9221608e4380250a1815fb308632bce99f611a673d2e17fc617123fdc6afcd2n,
      0xbd14f3366c73186314f182027217d0f70eba55817561de9e9a1f2c78bf5cbeadn,
      0x2f9aa48c0c9f82aaac65d7a9374a52d9dc138ed100a5809ede57e70697f48b56n,
      0x2ae60afa54271cb421c12e4441c2dac0a25f25c9433a6d07cb32419e993fe344n,
      0xc765c091680f0434b74c44507b932e5c80f6e995a975a275e5b130af1de1064cn,
      0x59d2d6e0c4a5d07b169dbcdfa39dad7aea7b7783a814399f4f44c4a36b6336d3n,
      0xdd14d1387d10740187d71ad9500475399559c0922dbe2576882e61f1edd84692n,
      0x5412b8395509935406811ab3da43ab80be7acd8ffb5f398ab70f056ff3740f46n,
      0xeadab258ae7d779ce5f10fbb1bb0273116b8eccbf738ed878db570de78bed1e4n,
      0x6133aa40e6db75373b7cfc79e6f8b8ce80e441e6c1f98b85a593464dda3cf9c0n,
      0x5418948467112660639b932af9b1b212e40d71b24326b4606679d168a765af4fn,
      0x44f618505355c7e4e7c0f81d6bb15d2ec9cf9b366f9e1dc37db52745486e6b0fn,
      0xa410ee174a66a4d64f3c000b93efe15b5b1f3e39e962af2580fcd30bce07d039n,
      0x09c3eb05ac9552022a45c00d01a47cd56f95f94afdd4402299dba1291a17f976n,
      0x0e780f6acd081b07320a55208fa3e1d884e2e95cb13d1c98c74b7e853372c813n,
      0x2b60e8c21f78ef22fa4297f28f1d8c747181edfc465121b39c16be97d4fb8a04n,
      0xf24da95060a8598c06e9dfb3926e1a8c8bd8ec2c65be10e69323442840724888n,
      0x7e220fc095bcd2b0f5ef134d9620d89f6d7a1e8719ce8893bb9aff15e847578fn,
      0xcfe9e475c4bd32f1e36b2cc65a959c403c59979ff914fb629a64385b0c680a71n,
      0x25237fb8d1bfdc01ca5363ec3166a2b40789e38d5adcc8627801da683d2e1d76n,
      0x42647949fed0250139c01212d739d8c83d2852589ebc892d3490ae52e411432cn,
      0x34397a30930e6dd4fb5af48084afc5cfbe02c18dd9544b3faff4e2e90bf00cb9n,
      0xa028f33226adc3d1cb72b19eb6808dab9190b25066a45cacb5dfe5d640e57cf2n,
      0x7cff66ba47a05f932d06d168c294266dcb0d3943a4f2a4a75c860b9fd6e53092n,
      0x5ca1b32f1dbfadd83205882be5eb76f34c49e834726f5239905a0e70d0a5e0ebn,
      0x1b4b087a89e4eca6cdd237210932559dc8fd167d5f4f2d9acb13264e1e305479n,
    ]

    const flagsUint256 = 0x2f3c0000000n

    let expectedRoot = merkleHelper.merkleMultiProof(leaves, proofs, flagsUint256)

    deployer = await blockchain.treasury('deployer')
    const result = await calculator.send(
      deployer.getSender(),
      {
        value: toNano('10000'),
      },
      {
        $$type: 'MerkleMultiProof',
        leaves: listOfHashesAsDictionary(leaves),
        leavesLen: 10n,
        proofs: listOfHashesAsDictionary(proofs),
        proofsLen: 33n,
        proofFlagBits: flagsUint256,
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: calculator.address,
      success: true,
    })

    expect(await calculator.getGetRoot()).toBe(expectedRoot)

  })
  /*
  it('merkleRoot 128', async () => {
    const leaves: string[] = []
    for (let i = 0; i < 128; i++) {
      leaves.push('a')
    }
    const hashedLeaves: bigint[] = leaves.map((e) => merkleHelper.hashLeafData(e, hashFunctionKeccak))

    const hashedLeavesDict = listOfHashesAsDictionary(hashedLeaves)

    const flagsUint128: bigint  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn 

    const expectedRoot = merkleHelper.getMerkleRoot(hashedLeaves)

    deployer = await blockchain.treasury('deployer')
    const result = await calculator.send(
      deployer.getSender(),
      {
        value: toNano('100000'),
      },
      {
        $$type: 'MerkleMultiProof',
        leaves: hashedLeavesDict,
        leavesLen: 128n,
        proofs: Dictionary.empty(),
        proofsLen: 0n,
        proofFlagBits: flagsUint128,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: calculator.address,
      success: true,
    })

    expect(await calculator.getGetRoot()).toBe(expectedRoot)
  })
  */

})
