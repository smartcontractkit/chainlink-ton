import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'
import { SigningKey, randomBytes, computeAddress } from 'ethers'
import { secp256k1_verifier } from '../../wrappers/test/lib'

describe('secp256k1_verifier', () => {
  let blockchain: Blockchain

  var code: {
    verifier: Cell
  }

  beforeAll(async () => {
    code = {
      verifier: await compile('tests.lib.secp256k1_verifier'),
    }
  }, 10_000)

  var acc: {
    deployer: SandboxContract<TreasuryContract>
  }

  var bind: {
    verifier: SandboxContract<secp256k1_verifier.ContractClient>
  }

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    blockchain.now = Math.floor(Date.now() / 1000) // set to current unix timestamp

    // Set up accounts
    acc = {
      deployer: await blockchain.treasury('deployer'),
    }

    bind = {
      verifier: null as any,
    }

    // Set up verifier contract
    {
      bind.verifier = blockchain.openContract(
        secp256k1_verifier.ContractClient.newFrom(Cell.EMPTY, code.verifier),
      )
    }

    // Deploy verifier contract
    {
      const body = Cell.EMPTY
      const r = await bind.verifier.sendInternal(acc.deployer.getSender(), toNano('0.2'), body)

      expect(r.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.verifier.address,
        deploy: true,
        success: true,
      })
    }
  })

  it('should evm_ecrecover random signatures', async () => {
    const res = Array.from({ length: 10_000 }, (_, i) => new SigningKey(randomBytes(32)))

    for (let i = 0; i < res.length; i++) {
      const sk = res[i]
      const address = computeAddress(sk.publicKey)
      const msg = randomBytes(32)
      const sig = sk.sign(msg)

      const msgInt = BigInt('0x' + Buffer.from(msg).toString('hex'))
      const sigc = beginCell()
        .storeUint(sig.v, 8)
        .storeUint(BigInt(sig.r), 256)
        .storeUint(BigInt(sig.s), 256)
        .endCell()

      const expectedAddrInt = BigInt('0x' + address.slice(2))
      expect(await bind.verifier.getEVM_ecrecoverFrom(msgInt, sigc)).toEqual(expectedAddrInt)
    }
  })
})
