import { toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as rt from '../../../wrappers/gen/ccip/Router'
import {
  CURSE_ROLE,
  UNCURSE_ROLE,
  ROUTER_CONTRACT_VERSION,
  SUPPORTED_PREV_VERSIONS,
} from '../../../wrappers/ccip/Router'
import { contractCode } from '../../../wrappers/codeLoader'
import { deployRouterContract } from './Router.Setup'

const SUBJECT = 1n

// The UltraFastCurse upgrade must not interrupt cursing: the RMN owner that
// could curse under 1.6.x keeps both powers afterwards with no role grant and
// no extra transaction, because migrate() seeds an empty policy and the owner
// is an implicit role bearer.
describe('Router.cursing - migration from 1.6.x', () => {
  let blockchain: Blockchain
  let contractOwner: SandboxContract<TreasuryContract>
  let rmnOwner: SandboxContract<TreasuryContract>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }
    contractOwner = await blockchain.treasury('contractOwner')
    rmnOwner = await blockchain.treasury('rmnOwner')
  })

  for (const [version, getPrevCode] of Object.entries(SUPPORTED_PREV_VERSIONS)) {
    it(`preserves curse state and authority across the ${version} upgrade`, async () => {
      const router = await deployRouterContract(
        blockchain,
        contractOwner,
        await getPrevCode(),
        rmnOwner.address,
      )

      // Curse through the legacy path, so the migration has state to carry.
      const cursed = await router.sendRouterRMNRemoteCurse(rmnOwner.getSender(), toNano('1'), {
        queryId: 0n,
        subjects: [SUBJECT],
      })
      expect(cursed.transactions).toHaveTransaction({
        from: rmnOwner.address,
        to: router.address,
        success: true,
      })
      expect(await router.getCursedSubjects()).toEqual([SUBJECT])

      // Upgrades are gated by the contract owner, not the RMN owner.
      const upgrade = await router.sendUpgradeableUpgrade(
        contractOwner.getSender(),
        toNano('0.05'),
        { queryId: 0n, code: await contractCode.ccip.local('Router') },
      )
      expect(upgrade.transactions).toHaveTransaction({
        from: contractOwner.address,
        to: router.address,
        success: true,
      })

      const [, upgradedVersion] = await router.getTypeAndVersion()
      expect(upgradedVersion.loadStringTail()).toEqual(ROUTER_CONTRACT_VERSION)

      expect(await router.getCursedSubjects()).toEqual([SUBJECT])
      expect((await router.getRmnOwner()).equals(rmnOwner.address)).toBe(true)
      expect((await router.getOwner()).equals(contractOwner.address)).toBe(true)

      // The policy is unseeded; authority comes from ownership alone.
      expect(await router.getRmnHasRole(CURSE_ROLE, rmnOwner.address)).toBe(false)
      expect(await router.getRmnHasRole(UNCURSE_ROLE, rmnOwner.address)).toBe(false)
      expect(await router.getRmnCanCurse(rmnOwner.address)).toBe(true)
      expect(await router.getRmnCanUncurse(rmnOwner.address)).toBe(true)

      // No further transaction needed: the legacy caller still works.
      const uncursed = await router.sendRouterRMNRemoteUncurse(rmnOwner.getSender(), toNano('1'), {
        queryId: 0n,
        subjects: [SUBJECT],
      })
      expect(uncursed.transactions).toHaveTransaction({
        from: rmnOwner.address,
        to: router.address,
        success: true,
      })
      expect(await router.getCursedSubjects()).toEqual([])
    })
  }
})
