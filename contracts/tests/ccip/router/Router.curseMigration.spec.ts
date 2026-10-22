import { toNano, beginCell, contractAddress } from '@ton/core'
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
import { LINK_TOKEN } from '../../../src/utils'
import * as upgradeable from '../../../wrappers/libraries/versioning/Upgradeable'

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

  it('rejects the upgrade when the legacy wrappedNative is not NATIVE_GRAM', async () => {
    const [version, getPrevCode] = Object.entries(SUPPORTED_PREV_VERSIONS)[0]
    const prevCode = await getPrevCode()

    // Build the legacy storage manually with a mismatched wrappedNative:
    // deployRouterContract always seeds NATIVE_GRAM, which migrate() accepts.
    const owner = await blockchain.treasury('mismatchOwner')
    const legacyRMN = beginCell()
    rt.Ownable2Step.store(
      rt.Ownable2Step.create({ owner: owner.address, pendingOwner: null }),
      legacyRMN,
    )
    rt.CursedSubjects.store(rt.CursedSubjects.create({ data: new Set() }), legacyRMN)
    legacyRMN.storeDict(null)

    const storageCell = beginCell()
    storageCell.storeUint(1234, 32) // id
    rt.Ownable2Step.store(
      rt.Ownable2Step.create({ owner: owner.address, pendingOwner: null }),
      storageCell,
    )
    storageCell.storeAddress(LINK_TOKEN) // wrappedNative: not the expected NATIVE_GRAM
    storageCell.storeDict(null) // onRamps
    storageCell.storeDict(null) // offRamps
    storageCell.storeRef(legacyRMN.endCell())

    const init = { code: prevCode, data: storageCell.endCell() }
    const mismatchedRouter = blockchain.openContract(
      rt.Router.fromAddress(contractAddress(0, init)),
    )
    const deployer = await blockchain.treasury('mismatchDeployer')
    await deployer.send({
      to: mismatchedRouter.address,
      value: toNano('1'),
      init,
      body: beginCell().endCell(),
    })

    const upgrade = await mismatchedRouter.sendUpgradeableUpgrade(
      owner.getSender(),
      toNano('0.05'),
      { queryId: 0n, code: await contractCode.ccip.local('Router') },
    )
    expect(upgrade.transactions).toHaveTransaction({
      from: owner.address,
      to: mismatchedRouter.address,
      success: false,
      exitCode: upgradeable.Error.VersionMismatch,
    })

    // The code must be unchanged: the contract still reports the legacy version.
    const [, upgradedVersion] = await mismatchedRouter.getTypeAndVersion()
    expect(upgradedVersion.loadStringTail()).toEqual(version)
  })
})
