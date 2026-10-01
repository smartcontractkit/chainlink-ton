import '@ton/test-utils'

import { Address, Cell, toNano } from '@ton/core'
import { Blockchain, internal } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'
import * as tar from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import { EventTopics } from '../../../wrappers/ccip/TokenAdminRegistry'
import {
  Fixture,
  RegistryErrors,
  coverageConfig,
  createBlockchain,
  entryAddress,
  expectRootFailure,
  rootEvent,
  rootEvents,
  setup,
} from './TokenAdminRegistry.Setup'

type Notification = { topic: number; body: (fx: Fixture) => Cell }

const notifications: Record<string, Notification> = {
  AdministratorTransferRequested: {
    topic: EventTopics.AdministratorTransferRequested,
    body: (fx) =>
      tar.TokenAdminRegistry_AdministratorTransferRequested.toCell(
        tar.TokenAdminRegistry_AdministratorTransferRequested.create({
          queryId: 11n,
          token: fx.token,
          currentAdministrator: fx.administrator.address,
          newAdministrator: fx.replacementAdministrator.address,
        }),
      ),
  },
  AdministratorTransferred: {
    topic: EventTopics.AdministratorTransferred,
    body: (fx) =>
      tar.TokenAdminRegistry_AdministratorTransferred.toCell(
        tar.TokenAdminRegistry_AdministratorTransferred.create({
          queryId: 12n,
          token: fx.token,
          newAdministrator: fx.administrator.address,
        }),
      ),
  },
  PoolSet: {
    topic: EventTopics.PoolSet,
    body: (fx) =>
      tar.TokenAdminRegistry_PoolSet.toCell(
        tar.TokenAdminRegistry_PoolSet.create({
          queryId: 13n,
          token: fx.token,
          previousPool: fx.pool,
          newPool: null,
        }),
      ),
  },
}

describe('TokenAdminRegistry - Entry Notifications', () => {
  let blockchain: Blockchain
  let fx: Fixture

  beforeAll(async () => {
    blockchain = await createBlockchain()
  })

  beforeEach(async () => {
    fx = await setup(blockchain)
  })

  const notify = (from: Address, body: Cell) =>
    blockchain.sendMessage(internal({ from, to: fx.registry.address, value: toNano('0.05'), body }))

  for (const [name, { topic, body }] of Object.entries(notifications)) {
    describe(name, () => {
      it('is emitted when sent by the entry of the token', async () => {
        const payload = body(fx)
        const result = await notify(entryAddress(fx), payload)
        expect(result.transactions).toHaveTransaction({
          from: entryAddress(fx),
          to: fx.registry.address,
          success: true,
        })
        expect(rootEvent(fx, result, topic).asCell()).toEqualCell(payload)
      })

      it('is rejected from accounts other than the entry of the token', async () => {
        for (const from of [fx.other.address, entryAddress(fx, fx.otherToken)]) {
          const result = await notify(from, body(fx))
          expectRootFailure(
            fx,
            result,
            from,
            RegistryErrors['TokenAdminRegistry_Error.UnauthorizedEntry'],
          )
          expect(rootEvents(fx, result, topic)).toHaveLength(0)
        }
      })
    })
  }

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'token_admin_registry_entry_notifications',
        await coverageConfig(),
      )
    }
  })
})
