import { Address, Cell, toNano } from '@ton/core'
import '@ton/test-utils'

import {
  CHAIN_ID,
  McmsLimitsHarness,
  buildStorageConfig,
  flatGroupLayout,
  makeRootMetadata,
  makeSigners,
} from './limits/harness'
import { mcms, rbactl } from '../../wrappers/mcms'
import { ac } from '../../wrappers/lib/access'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'
import { asSnakedCell, generateRandomContractId } from '../../src/utils'

const setConfigCall = (
  mcmsAddress: Address,
  signers: ReturnType<typeof makeSigners>,
  layout: ReturnType<typeof flatGroupLayout>,
): rbactl.Call => ({
  target: mcmsAddress,
  value: toNano('2'),
  data: mcms.builder.message.in.setConfig
    .encode({
      queryId: 1n,
      signerAddresses: signers.map((signer) => BigInt(signer.address)),
      signerGroups: signers.map((signer) => signer.group),
      groupQuorums: layout.groupQuorums,
      groupParents: layout.groupParents,
      clearRoot: false,
    })
    .asCell(),
})

describe.each(['1.6.2', 'local'] as const)(
  'MCMS + Timelock - batched config rotation (%s)',
  (version) => {
    it('applies 16/8 then 69/21 from one batch, in order', async () => {
      const initialLayout = flatGroupLayout({ activeGroups: 21 })
      const initialSigners = makeSigners(69, initialLayout)
      const harness = await McmsLimitsHarness.create({
        version,
        ownerSeed: `mcms-timelock-config-batch-${version}`,
        initialConfig: { signers: initialSigners, layout: initialLayout },
      })
      const { blockchain, owner, mcms: mcmsContract } = harness
      await harness.deploy()

      const timelockCode = await rbactl.ContractClient.code()
      const timelockData = {
        id: Number(generateRandomContractId()),
        initializer: owner.address,
        minDelay: 0,
        executorRoleCheckEnabled: false,
        opPendingInfo: { validAfter: 0n, opFinalizationTimeout: 0, opPendingId: 0n },
        rbac: ac.builder.data.contractData
          .encode({
            roles: ac.builder.data.rolesDict(
              new Map(
                [
                  rbactl.roles.admin,
                  rbactl.roles.proposer,
                  rbactl.roles.executor,
                  rbactl.roles.canceller,
                  rbactl.roles.bypasser,
                ].map((role) => [
                  role,
                  {
                    adminRole: rbactl.roles.admin,
                    membersLen: 0n,
                    hasRole: ac.builder.data.hasRoleDict([]),
                  },
                ]),
              ),
            ),
          })
          .asCell(),
      }
      const timelock = blockchain.openContract(
        rbactl.ContractClient.newFrom(timelockData, timelockCode),
      )

      expect(
        (
          await timelock.sendInternal(
            owner.getSender(),
            toNano('2'),
            rbactl.builder.message.in.init
              .encode({
                queryId: 1n,
                minDelay: 0,
                admin: owner.address,
                proposers: [mcmsContract.address],
                executors: [],
                cancellers: [],
                bypassers: [owner.address],
                executorRoleCheckEnabled: false,
                opFinalizationTimeout: 0,
              })
              .asCell(),
          )
        ).transactions,
      ).toHaveTransaction({ to: timelock.address, deploy: true, success: true })

      // Make Timelock the owner of MCMS so it can execute both setConfig calls.
      const ownable = blockchain.openContract(
        ownable2step.ContractClient.createFromAddress(mcmsContract.address),
      )
      await ownable.sendInternal(
        owner.getSender(),
        toNano('0.05'),
        ownable2step.builder.message.in.transferOwnership
          .encode({ queryId: 1n, newOwner: timelock.address })
          .asCell(),
      )
      const acceptCalls = asSnakedCell<rbactl.Call>(
        [
          {
            target: ownable.address,
            value: toNano('0.05'),
            data: ownable2step.builder.message.in.acceptOwnership.encode({ queryId: 1n }).asCell(),
          },
        ],
        (call) => rbactl.builder.data.call.encode(call),
      )
      expect(
        (
          await timelock.sendInternal(
            owner.getSender(),
            toNano('0.2'),
            rbactl.builder.message.in.bypasserExecuteBatch
              .encode({ queryId: 1n, calls: acceptCalls })
              .asCell(),
          )
        ).transactions,
      ).toHaveTransaction({ to: mcmsContract.address, success: true })
      expect(await ownable.getOwner()).toEqualAddress(timelock.address)

      // Timelock timestamps 1 and 2 are reserved for DONE/ERROR; use a realistic clock.
      blockchain.now = 100

      const intermediateLayout = flatGroupLayout({ activeGroups: 8 })
      const intermediateSigners = makeSigners(16, intermediateLayout)
      const targetLayout = flatGroupLayout({ activeGroups: 21 })
      const targetSigners = makeSigners(69, targetLayout)
      const calls = asSnakedCell<rbactl.Call>(
        [
          setConfigCall(mcmsContract.address, intermediateSigners, intermediateLayout),
          setConfigCall(mcmsContract.address, targetSigners, targetLayout),
        ],
        (call) => rbactl.builder.data.call.encode(call),
      )

      const scheduleOp: mcms.Op = {
        chainId: CHAIN_ID,
        multiSig: mcmsContract.address,
        nonce: 0n,
        to: timelock.address,
        value: toNano('0.2'),
        data: rbactl.builder.message.in.scheduleBatch
          .encode({ queryId: 1n, calls, predecessor: 0n, salt: 0n, delay: 0 })
          .asCell(),
      }
      const root = await harness.setRoot({
        signingSigners: initialSigners,
        validUntil: 1_000_000n,
        metadata: makeRootMetadata(mcmsContract.address, 0n, 1n),
        ops: [scheduleOp],
      })
      expect(root.outcome.exitCode).toBe(0)
      const scheduleExecution = await harness.execute(scheduleOp, root.opProofs[0], toNano('0.2'))
      expect(scheduleExecution.exitCode).toBe(0)
      expect(scheduleExecution.result.transactions).toHaveTransaction({
        to: timelock.address,
        op: rbactl.opcodes.in.ScheduleBatch,
        success: true,
      })

      // Fund Timelock so it can forward the two 2 TON setConfig calls.
      await timelock.sendInternal(owner.getSender(), toNano('10'), Cell.EMPTY)
      blockchain.now = blockchain.now! + 1 // delay=0, but readiness is strict

      const execution = await timelock.sendInternal(
        owner.getSender(),
        toNano('5'),
        rbactl.builder.message.in.executeBatch
          .encode({ queryId: 2n, calls, predecessor: 0n, salt: 0n })
          .asCell(),
      )
      expect(execution.transactions).toHaveTransaction({
        from: timelock.address,
        to: mcmsContract.address,
        success: true,
      })

      const setConfigTxs = execution.transactions.filter(
        (tx) =>
          tx.inMessage?.info.type === 'internal' &&
          tx.inMessage.info.src.equals(timelock.address) &&
          tx.inMessage.info.dest.equals(mcmsContract.address) &&
          tx.inMessage.body.beginParse().loadUint(32) === mcms.opcodes.in.SetConfig,
      )
      expect(setConfigTxs).toHaveLength(2)

      const finalConfig = await harness.getConfig()
      if (version === '1.6.2') {
        // Current live version supports both direct calls in one batch.
        const expectedSigners = buildStorageConfig(targetSigners, targetLayout).config.signers
        expect(finalConfig.signers.size).toBe(69)
        for (const [index, signerBytes] of expectedSigners) {
          expect(finalConfig.signers.get(index)?.equals(signerBytes)).toBe(true)
        }
      } else {
        // Latest main's iterator validation makes the second 69/21 call OOG.
        const expectedSigners = buildStorageConfig(intermediateSigners, intermediateLayout).config
          .signers
        expect(finalConfig.signers.size).toBe(16)
        for (const [index, signerBytes] of expectedSigners) {
          expect(finalConfig.signers.get(index)?.equals(signerBytes)).toBe(true)
        }
      }
    })
  },
)
