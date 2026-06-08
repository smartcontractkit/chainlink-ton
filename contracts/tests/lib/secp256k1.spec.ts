import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { beginCell, Cell, toNano } from '@ton/core'
import { SigningKey, randomBytes, computeAddress } from 'ethers'
import { secp256k1_verifier } from '../../wrappers/test/lib'
import { contractCode } from '../../wrappers/codeLoader'

describe('secp256k1_verifier', () => {
  let blockchain: Blockchain

  var code: {
    verifier: Cell
  }

  beforeAll(async () => {
    code = {
      verifier: await contractCode.ccip.local('tests.lib.secp256k1_verifier'),
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
    const keys = Array.from({ length: 1_000 }, (_, i) => new SigningKey(randomBytes(32)))

    for (let i = 0; i < keys.length; i++) {
      const sk = keys[i]
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

  it('should evm_ecrecover random signatures - different v formats', async () => {
    const keys = Array.from({ length: 10_000 }, (_, i) => new SigningKey(randomBytes(32)))

    for (let i = 0; i < keys.length; i++) {
      const sk = keys[i]
      const address = computeAddress(sk.publicKey)
      const msg = randomBytes(32)
      const sig = sk.sign(msg)

      const msgInt = BigInt('0x' + Buffer.from(msg).toString('hex'))
      // Choose a v format variant to test
      // 0: legacy (keep sig.v as 27/28)
      // 1: parity (0/1)
      // 2: eip155 (35 + chainId*2 + parity)
      // 3: recid2 (invalid)
      // 4: recid3 (invalid)
      const mode = i % 5

      const vToParity = (v: number): number => {
        if (v === 27) return 0
        if (v === 28) return 1
        if (v >= 35) return (v - 35) & 1
        if (v === 0 || v === 1) return v
        return -1
      }

      const vToEIP155 = (v: number, chainId: number = 1): number => {
        const parity = vToParity(v)
        if (parity < 0) return -1
        return 35 + chainId * 2 + parity
      }

      let testV: number = Number(sig.v)
      switch (mode) {
        case 1: {
          const p = vToParity(sig.v)
          testV = p >= 0 ? p : sig.v
          break
        }
        case 2: {
          const chainId = 1 + (i % 100)
          const vEip = vToEIP155(sig.v, chainId)
          testV = vEip >= 0 ? vEip : sig.v
          break
        }
        case 3: {
          const p = vToParity(sig.v)
          testV = p + 2 // 2 or 3 (raw recid)
          break
        }
        case 4: {
          const p = vToParity(sig.v)
          testV = p + 3
          break
        }
      }

      const sigc = beginCell()
        .storeUint(testV, 8)
        .storeUint(BigInt(sig.r), 256)
        .storeUint(BigInt(sig.s), 256)
        .endCell()

      const expectedAddrInt = BigInt('0x' + address.slice(2))
      const actual = await bind.verifier.getEVM_ecrecoverFrom(msgInt, sigc)

      // modes 0,1,2 are expected to recover; modes 3,4 (recid2/3) should fail (return 0)
      if (mode === 3 || mode === 4) {
        expect(actual).toEqual(0n)
      } else {
        expect(actual).toEqual(expectedAddrInt)
      }
    }
  })
})
