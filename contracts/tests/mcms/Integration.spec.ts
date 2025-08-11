import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, Dictionary, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'

import * as mcms from '../../wrappers/mcms/MCMS'
import * as rbactl from '../../wrappers/mcms/RBACTimelock'
import * as callproxy from '../../wrappers/mcms/CallProxy'
import * as ac from '../../wrappers/lib/access/AccessControl'
import * as counter from '../../wrappers/examples/Counter'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'

import { crc32 } from 'zlib'

describe('MCMS - IntegrationTest', () => {
  let blockchain: Blockchain

  var code: {
    mcms: Cell
    timelock: Cell
    callProxy: Cell
    counter: Cell
  }

  beforeAll(async () => {
    code = {
      mcms: await compile('mcms.MCMS'),
      timelock: await compile('mcms.RBACTimelock'),
      callProxy: await compile('mcms.CallProxy'),
      counter: await compile('examples.Counter'),
    }
  })

  var acc: {
    deployer: SandboxContract<TreasuryContract>
    other: SandboxContract<TreasuryContract>
  }

  var bind: {
    timelock: SandboxContract<rbactl.ContractClient>
    ac: SandboxContract<ac.ContractClient>
    callProxy: SandboxContract<callproxy.ContractClient>

    mcmsPropose: SandboxContract<mcms.ContractClient>
    mcmsVeto: SandboxContract<mcms.ContractClient>
    mcmsBypass: SandboxContract<mcms.ContractClient>

    counter: SandboxContract<counter.ContractClient>
  }

  const MCMS_NUM_GROUPS = 32

  const PROPOSE_COUNT = 8
  const PROPOSE_QUORUM = 4

  const VETO_COUNT = 22 + 7
  const VETO_QUORUM = (VETO_COUNT - 1) / 3 + 1

  const MIN_DELAY = 24n * 60n * 60n

  const signerAddresses: Address[] = []
  const signerPrivateKeys: bigint[] = []

  beforeEach(async () => {
    blockchain = await Blockchain.create()

    // Set up accounts
    acc = {
      deployer: await blockchain.treasury('deployer'),
      other: await blockchain.treasury('other'),
    }

    bind = {
      timelock: null as any,
      ac: null as any,
      mcmsPropose: null as any,
      mcmsVeto: null as any,
      mcmsBypass: null as any,
      callProxy: null as any,
      counter: null as any,
    }

    // Set up MCMS contracts
    {
      bind.mcmsPropose = blockchain.openContract(
        mcms.ContractClient.newFrom(
          mcms.builder.data.contractDataEmpty(
            crc32('mcms.mcms.test-integration-propose'),
            acc.deployer.address,
          ),
          code.mcms,
        ),
      )

      bind.mcmsVeto = blockchain.openContract(
        mcms.ContractClient.newFrom(
          mcms.builder.data.contractDataEmpty(
            crc32('mcms.mcms.test-integration-veto'),
            acc.deployer.address,
          ),
          code.mcms,
        ),
      )

      bind.mcmsBypass = blockchain.openContract(
        mcms.ContractClient.newFrom(
          mcms.builder.data.contractDataEmpty(
            crc32('mcms.mcms.test-integration-bypass'),
            acc.deployer.address,
          ),
          code.mcms,
        ),
      )
    }

    // Set up Timelock contract
    {
      const rbacStorage: ac.ContractData = {
        roles: ac.builder.data.rolesDict(
          new Map([
            [
              rbactl.roles.admin,
              {
                adminRole: rbactl.roles.admin, // default admin role
                membersLen: 1n, // one member (deployer)
                hasRole: ac.builder.data.hasRoleDict([acc.deployer.address]),
              },
            ],
            [
              rbactl.roles.proposer,
              {
                adminRole: rbactl.roles.admin, // default admin role
                membersLen: 1n, // one member (deployer)
                hasRole: ac.builder.data.hasRoleDict([bind.mcmsPropose.address]),
              },
            ],
            [
              rbactl.roles.executor,
              {
                adminRole: rbactl.roles.admin, // default admin role
                membersLen: 1n, // one member (deployer)
                hasRole: ac.builder.data.hasRoleDict([bind.mcmsPropose.address]), // TODO: Call proxy address
              },
            ],
            [
              rbactl.roles.canceller,
              {
                adminRole: rbactl.roles.admin, // default admin role
                membersLen: 1n, // one member (deployer)
                hasRole: ac.builder.data.hasRoleDict([bind.mcmsVeto.address]),
              },
            ],
            [
              rbactl.roles.bypasser,
              {
                adminRole: rbactl.roles.admin, // default admin role
                membersLen: 1n, // one member (deployer)
                hasRole: ac.builder.data.hasRoleDict([bind.mcmsBypass.address]),
              },
            ],
          ]),
        ),
      }

      const data = {
        id: crc32('mcms.timelock.test-integration'), // unique ID for this instance
        minDelay: MIN_DELAY,
        rbac: ac.builder.data.contractData.encode(rbacStorage),
      }

      bind.timelock = blockchain.openContract(rbactl.ContractClient.newFrom(data, code.timelock))
      bind.ac = blockchain.openContract(ac.ContractClient.newAt(bind.timelock.address))
    }

    // Set up CallProxy contract
    {
      const data = {
        id: crc32('mcms.call-proxy.test-integration'), // unique ID for this instance
        target: bind.timelock.address,
      }
      bind.callProxy = blockchain.openContract(
        callproxy.ContractClient.newFrom(data, code.callProxy),
      )
    }

    // Set up Counter contract
    {
      const data = {
        id: crc32('mcms.counter.test-integration'), // unique ID for this instance
        value: 0,
        ownable: {
          owner: bind.timelock.address,
          pendingOwner: null, // no pending owner
        },
      }
      bind.counter = blockchain.openContract(counter.ContractClient.newFrom(data, code.counter))
    }

    // Deploy Timelock contract
    {
      const body = rbactl.builder.message.topUp.encode({ queryId: 1n })
      const result = await bind.timelock.sendInternal(
        acc.deployer.getSender(),
        toNano('0.05'),
        body,
      )

      expect(result.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.timelock.address,
        deploy: true,
        success: true,
      })

      expect(await bind.ac.getHasRole(rbactl.roles.admin, acc.deployer.address)).toEqual(true)
      expect(await bind.ac.getRoleAdmin(rbactl.roles.admin)).toEqual(rbactl.roles.admin) // default admin role
    }

    // Deploy MCMS contracts
    {
      const body = mcms.builder.message.topUp.encode({ queryId: 1n })
      const result = await bind.mcmsPropose.sendInternal(
        acc.deployer.getSender(),
        toNano('0.05'),
        body,
      )

      expect(result.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        deploy: true,
        success: true,
      })

      // TODO: setConfig

      // Transfer ownership to Timelock
      const addr = bind.mcmsPropose.address
      const ownable = blockchain.openContract(ownable2step.ContractClient.newAt(addr))
      await transferOwnershipToTimelock(ownable)
    }

    {
      const body = mcms.builder.message.topUp.encode({ queryId: 1n })
      const result = await bind.mcmsVeto.sendInternal(
        acc.deployer.getSender(),
        toNano('0.05'),
        body,
      )

      expect(result.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsVeto.address,
        deploy: true,
        success: true,
      })

      // Transfer ownership to Timelock
      const addr = bind.mcmsVeto.address
      const ownable = blockchain.openContract(ownable2step.ContractClient.newAt(addr))
      await transferOwnershipToTimelock(ownable)
    }

    {
      const body = mcms.builder.message.topUp.encode({ queryId: 1n })
      const result = await bind.mcmsBypass.sendInternal(
        acc.deployer.getSender(),
        toNano('0.05'),
        body,
      )

      expect(result.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsBypass.address,
        deploy: true,
        success: true,
      })

      // Transfer ownership to Timelock
      const addr = bind.mcmsBypass.address
      const ownable = blockchain.openContract(ownable2step.ContractClient.newAt(addr))
      await transferOwnershipToTimelock(ownable)
    }

    // Deploy CallProxy contract
    {
      const body = mcms.builder.message.topUp.encode({ queryId: 1n })
      const result = await bind.callProxy.sendInternal(
        acc.deployer.getSender(),
        toNano('0.05'),
        body,
      )

      expect(result.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.callProxy.address,
        deploy: true,
        success: true,
      })

      expect(await bind.callProxy.getTarget()).toEqualAddress(bind.timelock.address)
    }

    // Deploy Counter contract
    {
      const result = await bind.counter.sendDeploy(acc.deployer.getSender(), toNano('0.05'))

      expect(result.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.counter.address,
        deploy: true,
        success: true,
      })

      expect(await bind.counter.getValue()).toEqual(0)
      expect(
        await blockchain
          .openContract(ownable2step.ContractClient.newAt(bind.counter.address))
          .getOwner(),
      ).toEqual(bind.timelock.address)
    }

    // TODO: Configure MCMS contracts and transfer ownership to Timelock
  })

  const transferOwnershipToTimelock = async (
    ownable: SandboxContract<ownable2step.ContractClient>,
  ) => {
    await ownable.sendInternal(
      acc.deployer.getSender(),
      toNano('0.05'),
      ownable2step.builder.message.transferOwnership.encode({
        queryId: 1n,
        newOwner: bind.timelock.address,
      }),
    )

    // Notice: using admin bypasser role to accept ownership transfer
    const result = await bind.timelock.sendInternal(
      acc.deployer.getSender(),
      toNano('0.10'),
      rbactl.builder.message.bypasserExecuteBatch.encode({
        queryId: 1n,
        // Notice: single call encoded as calls
        calls: rbactl.builder.data.call.encode({
          target: ownable.address,
          value: toNano('0.05'),
          data: ownable2step.builder.message.acceptOwnership.encode({ queryId: 1n }),
        }),
      }),
    )

    expect(result.transactions).toHaveTransaction({
      from: acc.deployer.address,
      to: bind.timelock.address,
      success: true,
    })

    expect(await ownable.getOwner()).toEqual(bind.timelock.address)
  }

  it('should execute chainOfActions', async () => {
    const memberAddr = await bind.ac.getRoleMember(rbactl.roles.admin, 0n)
    expect(memberAddr).not.toBeNull()
    expect(memberAddr!).toEqualAddress(acc.deployer.address) // default admin role

    // TODO: https://github.com/smartcontractkit/ccip-owner-contracts/blob/main/test/IntegrationTest.t.sol
  })
})
