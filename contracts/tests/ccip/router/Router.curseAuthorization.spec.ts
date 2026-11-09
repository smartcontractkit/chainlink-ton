import { toNano, Address } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { LogTypes } from '../../../wrappers/ccip/Logs'
import { assertLog } from '../../Logs'
import * as coverage from '../../coverage/coverage'

import * as rt from '../../../wrappers/gen/ccip/Router'
import {
  CURSE_ROLE,
  UNCURSE_ROLE,
  createEmptyCursePolicy,
  createSplitCursePolicy,
} from '../../../wrappers/ccip/Router'
import { setup, contractsCoverageConfig } from './Router.Setup'

const DEFAULT_ADMIN_ROLE = 0n
const SUBJECT = 1n
const UNAUTHORIZED = 47400 // AccessControl_Error.UnauthorizedAccount

describe('Router.cursing - authorization', () => {
  let blockchain: Blockchain
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<TreasuryContract>

  // The Router contract owner, deliberately distinct from the RMN owner: it
  // gates upgrades, never cursing.
  let deployer: SandboxContract<TreasuryContract>
  let rmnOwner: SandboxContract<TreasuryContract>
  let curser: SandboxContract<TreasuryContract>
  let uncurser: SandboxContract<TreasuryContract>
  let admin: SandboxContract<TreasuryContract>
  let stranger: SandboxContract<TreasuryContract>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    feeQuoter = await blockchain.treasury('feeQuoter')
    onRamp = await blockchain.treasury('onRamp')
    offRamp = await blockchain.treasury('offRamp')
    rmnOwner = await blockchain.treasury('rmnOwner')
    curser = await blockchain.treasury('curser')
    uncurser = await blockchain.treasury('uncurser')
    admin = await blockchain.treasury('roleAdmin')
    stranger = await blockchain.treasury('stranger')
  })

  async function deploy(policy: rt.CursePolicy): Promise<SandboxContract<rt.Router>> {
    const r = await setup(blockchain, {
      feeQuoter,
      onRamp,
      offRamp,
      rmnOwner: rmnOwner.address,
      cursePolicy: policy,
    })
    deployer = r.deployer
    return r.router
  }

  async function curse(router: SandboxContract<rt.Router>, via: SandboxContract<TreasuryContract>) {
    return router.sendRouterRMNRemoteCurse(via.getSender(), toNano('1'), {
      queryId: 0n,
      subjects: [SUBJECT],
    })
  }

  async function uncurse(
    router: SandboxContract<rt.Router>,
    via: SandboxContract<TreasuryContract>,
  ) {
    return router.sendRouterRMNRemoteUncurse(via.getSender(), toNano('1'), {
      queryId: 0n,
      subjects: [SUBJECT],
    })
  }

  // RBAC changes on the RMN curse policy are wrapped in Router_RMNAccessControlMessage
  // so they don't collide with the Router's own top-level AccessControl messages.
  async function grantRole(
    router: SandboxContract<rt.Router>,
    via: ReturnType<SandboxContract<TreasuryContract>['getSender']>,
    body: { queryId: bigint; role: bigint; account: Address },
  ) {
    return router.sendRouterRMNAccessControlMessage(via, toNano('1'), {
      content: rt.AccessControl_GrantRole.create(body),
    })
  }

  async function revokeRole(
    router: SandboxContract<rt.Router>,
    via: ReturnType<SandboxContract<TreasuryContract>['getSender']>,
    body: { queryId: bigint; role: bigint; account: Address },
  ) {
    return router.sendRouterRMNAccessControlMessage(via, toNano('1'), {
      content: rt.AccessControl_RevokeRole.create(body),
    })
  }

  async function renounceRole(
    router: SandboxContract<rt.Router>,
    via: ReturnType<SandboxContract<TreasuryContract>['getSender']>,
    body: { queryId: bigint; role: bigint; callerConfirmation: Address },
  ) {
    return router.sendRouterRMNAccessControlMessage(via, toNano('1'), {
      content: rt.AccessControl_RenounceRole.create(body),
    })
  }

  function expectAccepted(
    result: Awaited<ReturnType<typeof curse>>,
    router: SandboxContract<rt.Router>,
    from: Address,
  ) {
    expect(result.transactions).toHaveTransaction({ from, to: router.address, success: true })
  }

  function expectRejected(
    result: Awaited<ReturnType<typeof curse>>,
    router: SandboxContract<rt.Router>,
    from: Address,
  ) {
    expect(result.transactions).toHaveTransaction({
      from,
      to: router.address,
      success: false,
      exitCode: UNAUTHORIZED,
    })
  }

  describe('split roles', () => {
    let router: SandboxContract<rt.Router>

    beforeEach(async () => {
      router = await deploy(
        createSplitCursePolicy(rmnOwner.address, {
          admin: admin.address,
          curser: curser.address,
          uncurser: uncurser.address,
        }),
      )
    })

    it('lets a CURSE_ROLE holder curse but not uncurse', async () => {
      const cursed = await curse(router, curser)
      expectAccepted(cursed, router, curser.address)
      assertLog(cursed.transactions, router.address, LogTypes.Cursed, { subject: SUBJECT })
      expect(await router.getCursedSubjects()).toEqual([SUBJECT])

      expectRejected(await uncurse(router, curser), router, curser.address)
      expect(await router.getCursedSubjects()).toEqual([SUBJECT])
    })

    it('lets an UNCURSE_ROLE holder uncurse but not curse', async () => {
      expectRejected(await curse(router, uncurser), router, uncurser.address)

      await curse(router, curser)
      const uncursed = await uncurse(router, uncurser)
      expectAccepted(uncursed, router, uncurser.address)
      assertLog(uncursed.transactions, router.address, LogTypes.Uncursed, { subject: SUBJECT })
      expect(await router.getCursedSubjects()).toEqual([])
    })

    it('rejects an account holding no role', async () => {
      expectRejected(await curse(router, stranger), router, stranger.address)
      expectRejected(await uncurse(router, stranger), router, stranger.address)
    })

    it('rejects the Router contract owner, which is not the RMN owner', async () => {
      expect(deployer.address.equals(rmnOwner.address)).toBe(false)
      expect((await router.getOwner()).equals(deployer.address)).toBe(true)
      expectRejected(await curse(router, deployer), router, deployer.address)
    })

    it('lets a role holder renounce', async () => {
      const result = await renounceRole(router, curser.getSender(), {
        queryId: 0n,
        role: CURSE_ROLE,
        callerConfirmation: curser.address,
      })
      expectAccepted(result, router, curser.address)
      expect(await router.getRmnHasRole(CURSE_ROLE, curser.address)).toBe(false)
      expectRejected(await curse(router, curser), router, curser.address)
    })

    it('lets an explicit DEFAULT_ADMIN holder grant a role', async () => {
      const result = await grantRole(router, admin.getSender(), {
        queryId: 0n,
        role: CURSE_ROLE,
        account: stranger.address,
      })
      expectAccepted(result, router, admin.address)
      expectAccepted(await curse(router, stranger), router, stranger.address)
    })

    it('rejects a grant from an account that administers nothing', async () => {
      expectRejected(
        await grantRole(router, curser.getSender(), {
          queryId: 0n,
          role: CURSE_ROLE,
          account: stranger.address,
        }),
        router,
        curser.address,
      )
      expect(await router.getRmnHasRole(CURSE_ROLE, stranger.address)).toBe(false)
    })
  })

  describe('empty policy (the state migrate() produces)', () => {
    let router: SandboxContract<rt.Router>

    beforeEach(async () => {
      router = await deploy(createEmptyCursePolicy(rmnOwner.address))
    })

    // This is the legacy-path regression guard: after the upgrade the RMN
    // timelock keeps curse and uncurse authority without any role grant.
    it('lets the RMN owner curse and uncurse', async () => {
      expectAccepted(await curse(router, rmnOwner), router, rmnOwner.address)
      expect(await router.getCursedSubjects()).toEqual([SUBJECT])
      expectAccepted(await uncurse(router, rmnOwner), router, rmnOwner.address)
      expect(await router.getCursedSubjects()).toEqual([])
    })

    it('reports the RMN owner through canCurse but not through hasRole', async () => {
      expect(await router.getRmnHasRole(CURSE_ROLE, rmnOwner.address)).toBe(false)
      expect(await router.getRmnHasRole(UNCURSE_ROLE, rmnOwner.address)).toBe(false)
      expect(await router.getRmnCanCurse(rmnOwner.address)).toBe(true)
      expect(await router.getRmnCanUncurse(rmnOwner.address)).toBe(true)

      expect(await router.getRmnCanCurse(stranger.address)).toBe(false)
      expect(await router.getRmnCanUncurse(stranger.address)).toBe(false)
    })

    it('rejects everyone else', async () => {
      expectRejected(await curse(router, stranger), router, stranger.address)
      expectRejected(await curse(router, deployer), router, deployer.address)
    })

    // The UltraFastCurse rollout in one test: the RMN owner grants CURSE_ROLE
    // to a fast curser, which can then curse but never uncurse.
    it('lets the RMN owner grant CURSE_ROLE, and revoke it again', async () => {
      const granted = await grantRole(router, rmnOwner.getSender(), {
        queryId: 0n,
        role: CURSE_ROLE,
        account: curser.address,
      })
      expectAccepted(granted, router, rmnOwner.address)
      expect(await router.getRmnHasRole(CURSE_ROLE, curser.address)).toBe(true)
      expect(await router.getRmnCanCurse(curser.address)).toBe(true)
      expect(await router.getRmnCanUncurse(curser.address)).toBe(false)

      expectAccepted(await curse(router, curser), router, curser.address)
      expectRejected(await uncurse(router, curser), router, curser.address)

      const revoked = await revokeRole(router, rmnOwner.getSender(), {
        queryId: 0n,
        role: CURSE_ROLE,
        account: curser.address,
      })
      expectAccepted(revoked, router, rmnOwner.address)
      expect(await router.getRmnCanCurse(curser.address)).toBe(false)
      expectRejected(await curse(router, curser), router, curser.address)
    })
  })

  // Revoking the last explicit DEFAULT_ADMIN cannot freeze the policy, because
  // the RMN owner administers it implicitly.
  it('cannot be locked out by revoking the last DEFAULT_ADMIN', async () => {
    const router = await deploy(createSplitCursePolicy(rmnOwner.address, { admin: admin.address }))

    expectAccepted(
      await revokeRole(router, rmnOwner.getSender(), {
        queryId: 0n,
        role: DEFAULT_ADMIN_ROLE,
        account: admin.address,
      }),
      router,
      rmnOwner.address,
    )
    expect(await router.getRmnHasRole(DEFAULT_ADMIN_ROLE, admin.address)).toBe(false)

    expectAccepted(
      await grantRole(router, rmnOwner.getSender(), {
        queryId: 0n,
        role: CURSE_ROLE,
        account: curser.address,
      }),
      router,
      rmnOwner.address,
    )
    expectAccepted(await curse(router, curser), router, curser.address)
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_curse_authorization',
        await contractsCoverageConfig(),
      )
    }
  })
})
