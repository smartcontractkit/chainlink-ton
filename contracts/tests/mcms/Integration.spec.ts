import '@ton/test-utils'

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import { KeyPair, sign } from '@ton/crypto'
import { compile } from '@ton/blueprint'

import { generateEd25519KeyPair, asSnakeData, uint8ArrayToBigInt } from '../../src/utils'

import { mcms } from '../../wrappers/mcms'
import { rbactl } from '../../wrappers/mcms'
import { ac } from '../../wrappers/lib/access'
import * as counter from '../../wrappers/examples/Counter'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'

import { crc32 } from 'zlib'
import { merkleProof } from '../../src/mcms'

describe('MCMS - IntegrationTest', () => {
  let blockchain: Blockchain

  // TODO: blockchain global chain ID (will need to be signed int)
  let chainId = -239n

  var code: {
    mcms: Cell
    timelock: Cell
    counter: Cell
  }

  beforeAll(async () => {
    code = {
      mcms: await compile('mcms.MCMS'),
      timelock: await compile('mcms.RBACTimelock'),
      counter: await compile('examples.Counter'),
    }
  }, 10_000)

  var acc: {
    deployer: SandboxContract<TreasuryContract>
    other: SandboxContract<TreasuryContract>
  }

  var bind: {
    timelock: SandboxContract<rbactl.ContractClient>
    ac: SandboxContract<ac.ContractClient>

    mcmsPropose: SandboxContract<mcms.ContractClient>
    mcmsVeto: SandboxContract<mcms.ContractClient>
    mcmsBypass: SandboxContract<mcms.ContractClient>

    counter: SandboxContract<counter.ContractClient>
  }

  const MCMS_NUM_GROUPS = 32

  const PROPOSE_COUNT = 8
  const PROPOSE_QUORUM = 4

  const VETO_COUNT = 22 + 7
  const VETO_QUORUM = Math.floor((VETO_COUNT - 1) / 3) + 1

  const MIN_DELAY = 24n * 60n * 60n

  // Notice: no finalization timeout between ops
  const OP_FINALIZATION_TIMEOUT_ZERO = 0n

  let signerKeyPairs: KeyPair[] = []

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    blockchain.now = Math.floor(Date.now() / 1000) // set to current unix timestamp

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
      counter: null as any,
    }

    // Generate signer key pairs
    signerKeyPairs = await _signerKeyPairs()

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
                membersLen: 0n, // no members yet
                hasRole: ac.builder.data.hasRoleDict([]),
              },
            ],
            [
              rbactl.roles.proposer,
              {
                adminRole: rbactl.roles.admin, // default admin role
                membersLen: 0n, // no members yet
                hasRole: ac.builder.data.hasRoleDict([]),
              },
            ],
            [
              rbactl.roles.executor,
              {
                adminRole: rbactl.roles.admin, // default admin role
                membersLen: 0n, // no members yet
                hasRole: ac.builder.data.hasRoleDict([]),
              },
            ],
            [
              rbactl.roles.canceller,
              {
                adminRole: rbactl.roles.admin, // default admin role
                membersLen: 0n, // no members yet
                hasRole: ac.builder.data.hasRoleDict([]),
              },
            ],
            [
              rbactl.roles.bypasser,
              {
                adminRole: rbactl.roles.admin, // default admin role
                membersLen: 0n, // no members yet
                hasRole: ac.builder.data.hasRoleDict([]),
              },
            ],
          ]),
        ),
      }

      const data = {
        id: crc32('mcms.timelock.test-integration'), // unique ID for this instance
        minDelay: MIN_DELAY,
        executorRoleCheckEnabled: true,
        opPendingInfo: {
          validAfter: 0,
          opFinalizationTimeout: 0n,
          opPendingId: 0n,
        },
        rbac: ac.builder.data.contractData.encode(rbacStorage).asCell(),
      }

      bind.timelock = blockchain.openContract(rbactl.ContractClient.newFrom(data, code.timelock))
      bind.ac = blockchain.openContract(ac.ContractClient.newAt(bind.timelock.address))
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
      const body = rbactl.builder.message.in.init
        .encode({
          queryId: 1n,
          minDelay: MIN_DELAY,
          admin: acc.deployer.address,
          proposers: [bind.mcmsPropose.address],
          executors: [],
          cancellers: [bind.mcmsVeto.address],
          bypassers: [bind.mcmsBypass.address],
          executorRoleCheckEnabled: true,
          opFinalizationTimeout: 0n,
        })
        .asCell()
      const r = await bind.timelock.sendInternal(acc.deployer.getSender(), toNano('0.2'), body)

      expect(r.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.timelock.address,
        deploy: true,
        success: true,
      })

      expect(await bind.ac.getHasRole(rbactl.roles.admin, acc.deployer.address)).toEqual(true)
      expect(await bind.ac.getRoleAdmin(rbactl.roles.admin)).toEqual(rbactl.roles.admin) // default admin role

      // Add Timelock as ADMIN of self
      const r1 = await bind.ac.sendInternal(
        acc.deployer.getSender(),
        toNano('0.05'),
        ac.builder.message.in.grantRole
          .encode({
            queryId: 1n,
            role: rbactl.roles.admin,
            account: bind.timelock.address,
          })
          .asCell(),
      )

      expect(r1.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.ac.address,
        success: true,
      })
    }

    // Set up (deploy, configure) MCMS contracts and transfer ownership to Timelock
    {
      const body = Cell.EMPTY
      const r = await bind.mcmsPropose.sendInternal(acc.deployer.getSender(), toNano('0.05'), body)

      expect(r.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        deploy: true,
        success: true,
      })

      // Set config
      const rSetConfig = await bind.mcmsPropose.sendInternal(
        acc.deployer.getSender(),
        toNano('0.2'),
        mcms.builder.message.in.setConfig
          .encode({
            queryId: 1n,
            signerKeys: proposerKeyPairs().map((v) => uint8ArrayToBigInt(v.publicKey)),
            signerGroups: Array(PROPOSE_COUNT).fill(0),
            groupQuorums: new Map(Array.from({ length: MCMS_NUM_GROUPS }, (_, i) => [i, 0])).set(
              0,
              PROPOSE_QUORUM,
            ),
            groupParents: new Map(Array.from({ length: MCMS_NUM_GROUPS }, (_, i) => [i, 0])),
            clearRoot: false,
          })
          .asCell(),
      )

      expect(rSetConfig.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        success: true,
      })

      // Transfer ownership to Timelock
      const addr = bind.mcmsPropose.address
      const ownable = blockchain.openContract(ownable2step.ContractClient.newAt(addr))
      await transferOwnershipToTimelock(ownable)
    }

    {
      const body = Cell.EMPTY
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

      // Set config
      const rSetConfig = await bind.mcmsVeto.sendInternal(
        acc.deployer.getSender(),
        toNano('0.2'),
        mcms.builder.message.in.setConfig
          .encode({
            queryId: 1n,
            signerKeys: vetoKeyPairs().map((v) => uint8ArrayToBigInt(v.publicKey)),
            signerGroups: Array(VETO_COUNT).fill(0),
            groupQuorums: new Map(Array.from({ length: MCMS_NUM_GROUPS }, (_, i) => [i, 0])).set(
              0,
              VETO_QUORUM,
            ),

            groupParents: new Map(Array.from({ length: MCMS_NUM_GROUPS }, (_, i) => [i, 0])),
            clearRoot: false,
          })
          .asCell(),
      )

      expect(rSetConfig.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsVeto.address,
        success: true,
      })

      // Transfer ownership to Timelock
      const addr = bind.mcmsVeto.address
      const ownable = blockchain.openContract(ownable2step.ContractClient.newAt(addr))
      await transferOwnershipToTimelock(ownable)
    }

    {
      const body = Cell.EMPTY
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

      // Set config
      const rSetConfig = await bind.mcmsBypass.sendInternal(
        acc.deployer.getSender(),
        toNano('0.2'),
        mcms.builder.message.in.setConfig
          .encode({
            queryId: 1n,
            signerKeys: signerKeyPairs.map((v) => uint8ArrayToBigInt(v.publicKey)),
            signerGroups: Array(PROPOSE_COUNT + VETO_COUNT)
              .fill(1, 0, PROPOSE_COUNT)
              .fill(2, PROPOSE_COUNT, PROPOSE_COUNT + VETO_COUNT),
            groupQuorums: new Map(Array.from({ length: MCMS_NUM_GROUPS }, (_, i) => [i, 0]))
              .set(0, 2)
              .set(1, PROPOSE_QUORUM)
              .set(2, VETO_QUORUM),
            groupParents: new Map(Array.from({ length: MCMS_NUM_GROUPS }, (_, i) => [i, 0]))
              .set(0, 0)
              .set(1, 0)
              .set(2, 0),
            clearRoot: false,
          })
          .asCell(),
      )

      expect(rSetConfig.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsBypass.address,
        success: true,
      })

      // Transfer ownership to Timelock
      const addr = bind.mcmsBypass.address
      const ownable = blockchain.openContract(ownable2step.ContractClient.newAt(addr))
      await transferOwnershipToTimelock(ownable)
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
  }, 20_000) // setup can take a while, since we deploy and set up many contracts

  const transferOwnershipToTimelock = async (
    ownable: SandboxContract<ownable2step.ContractClient>,
  ) => {
    await ownable.sendInternal(
      acc.deployer.getSender(),
      toNano('0.05'),
      ownable2step.builder.message.in.transferOwnership
        .encode({
          queryId: 1n,
          newOwner: bind.timelock.address,
        })
        .asCell(),
    )

    // Notice: using admin bypasser role to accept ownership transfer
    const result = await bind.timelock.sendInternal(
      acc.deployer.getSender(),
      toNano('0.10'),
      rbactl.builder.message.in.bypasserExecuteBatch
        .encode({
          queryId: 1n,
          // Notice: single call encoded as calls
          calls: rbactl.builder.data.call
            .encode({
              target: ownable.address,
              value: toNano('0.05'),
              data: ownable2step.builder.message.in.acceptOwnership
                .encode({ queryId: 1n })
                .asCell(),
            })
            .asCell(),
        })
        .asCell(),
    )

    expect(result.transactions).toHaveTransaction({
      from: acc.deployer.address,
      to: bind.timelock.address,
      success: true,
    })

    expect(await ownable.getOwner()).toEqual(bind.timelock.address)
  }

  const _signerKeyPairs = async (): Promise<KeyPair[]> => {
    const res = await Promise.all(
      Array.from(
        { length: PROPOSE_COUNT + VETO_COUNT },
        async (_, i) => await generateEd25519KeyPair(),
      ),
    )

    // Sort result by public key (strictly increasing)
    res.sort((a, b) => {
      const aKey = uint8ArrayToBigInt(a.publicKey)
      const bKey = uint8ArrayToBigInt(b.publicKey)
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
    })

    return res
  }

  const proposerKeyPairs = (): KeyPair[] => {
    return Array.from({ length: PROPOSE_COUNT }, (_, i) => signerKeyPairs[i])
  }

  const vetoKeyPairs = (): KeyPair[] => {
    return Array.from({ length: VETO_COUNT }, (_, i) => signerKeyPairs[PROPOSE_COUNT + i])
  }

  it('should execute chainOfActions', async () => {
    expect(await bind.ac.getRoleMemberCount(rbactl.roles.admin)).toEqual(2n)
    expect(await bind.ac.getRoleMember(rbactl.roles.admin, 0n)).not.toBeNull()

    let calls: Cell // vec<rbactl.Call>
    let callsHash: bigint
    let proposePredecessor = 0n

    // increment twice through regular flow
    {
      calls = asSnakeData<rbactl.Call>(
        [
          {
            target: bind.counter.address,
            value: toNano('0.05'),
            data: counter.builder.message.in.increaseCount.encode({ queryId: 1n }).asCell(),
          },
          {
            target: bind.counter.address,
            value: toNano('0.05'),
            data: counter.builder.message.in.increaseCount.encode({ queryId: 2n }).asCell(),
          },
        ],
        (c) => rbactl.builder.data.call.encode(c),
      )

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: proposePredecessor,
        salt: 0n,
      }
      callsHash = await bind.timelock.getHashOperationBatch(operationBatch)

      const signers = proposerKeyPairs().map((v) => ({
        publicKey: v.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, v.secretKey),
      }))
      const validUntil = BigInt(blockchain.now || 0) + 2n * 60n * 60n // block.timestamp + 2 hours
      const metadata = {
        chainId,
        multiSig: bind.mcmsPropose.address,
        preOpCount: 0n,
        postOpCount: 1n,
        overridePreviousRoot: false,
      }
      const ops: mcms.Op[] = [
        {
          chainId,
          multiSig: bind.mcmsPropose.address,
          nonce: 0n,
          to: bind.timelock.address,
          value: toNano('0.05'),
          data: rbactl.builder.message.in.scheduleBatch
            .encode({
              queryId: 1n,
              calls,
              predecessor: proposePredecessor,
              salt: 0n,
              delay: MIN_DELAY,
            })
            .asCell(),
        },
      ]
      const [setRoot, opProofs] = merkleProof.build(
        signers,
        validUntil,
        metadata,
        ops,
        OP_FINALIZATION_TIMEOUT_ZERO,
      )

      const r = await bind.mcmsPropose.sendInternal(
        acc.deployer.getSender(),
        toNano('0.10'),
        mcms.builder.message.in.setRoot.encode(setRoot).asCell(),
      )

      expect(r.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        success: true,
      })

      const r1 = await bind.mcmsPropose.sendInternal(
        acc.deployer.getSender(),
        toNano('0.10'),
        mcms.builder.message.in.execute
          .encode({
            queryId: 1n,
            op: mcms.builder.data.op.encode(ops[0]).asCell(),
            proof: opProofs[0],
          })
          .asCell(),
      )

      expect(r1.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        success: true,
      })

      // fails if minDelay hasn't elapsed

      const r2 = await bind.timelock.sendInternal(
        acc.deployer.getSender(),
        toNano('0.10'),
        rbactl.builder.message.in.executeBatch
          .encode({
            queryId: 1n,
            predecessor: proposePredecessor,
            salt: 0n,
            calls,
          })
          .asCell(),
      )

      expect(r2.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.timelock.address,
        success: false,
        exitCode: rbactl.Error.OperationNotReady,
      })

      blockchain.now = blockchain.now! + Number(MIN_DELAY)

      const r3 = await bind.timelock.sendInternal(
        acc.deployer.getSender(),
        toNano('1'), // TODO: notice the gas value required to pass is higher b/c reserveToncoinsOnBalance (check)
        rbactl.builder.message.in.executeBatch
          .encode({
            queryId: 2n,
            predecessor: proposePredecessor,
            salt: 0n,
            calls,
          })
          .asCell(),
      )

      expect(r3.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.timelock.address,
        success: true,
      })

      expect(r3.transactions).toHaveTransaction({
        from: bind.timelock.address,
        to: bind.counter.address,
        success: true,
      })

      expect(await bind.counter.getValue()).toEqual(2)
    }

    proposePredecessor = callsHash

    //
    // again, increment twice through regular flow
    //
    {
      const signers = proposerKeyPairs().map((v) => ({
        publicKey: v.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, v.secretKey),
      }))
      const validUntil = BigInt(blockchain.now || 0) + 2n * 60n * 60n // block.timestamp + 2 hours
      const metadata = {
        chainId,
        multiSig: bind.mcmsPropose.address,
        preOpCount: 1n,
        postOpCount: 2n,
        overridePreviousRoot: false,
      }
      const ops: mcms.Op[] = [
        {
          chainId,
          multiSig: bind.mcmsPropose.address,
          nonce: 1n,
          to: bind.timelock.address,
          value: toNano('0.05'),
          data: rbactl.builder.message.in.scheduleBatch
            .encode({
              queryId: 1n,
              calls,
              predecessor: proposePredecessor,
              salt: 0n,
              delay: MIN_DELAY,
            })
            .asCell(),
        },
      ]

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        validUntil,
        metadata,
        ops,
        OP_FINALIZATION_TIMEOUT_ZERO,
      )

      const r = await bind.mcmsPropose.sendInternal(
        acc.deployer.getSender(),
        toNano('0.10'),
        mcms.builder.message.in.setRoot.encode(setRoot).asCell(),
      )

      expect(r.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        success: true,
      })

      const r1 = await bind.mcmsPropose.sendInternal(
        acc.deployer.getSender(),
        toNano('0.10'),
        mcms.builder.message.in.execute
          .encode({
            queryId: 1n,
            op: mcms.builder.data.op.encode(ops[0]).asCell(),
            proof: opProofs[0],
          })
          .asCell(),
      )

      expect(r1.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        success: true,
      })

      blockchain.now = blockchain.now! + Number(MIN_DELAY)

      // fails if predecessor isn't right
      const r2 = await bind.timelock.sendInternal(
        acc.deployer.getSender(),
        toNano('0.80'), // TODO: notice the gas value required to pass is higher b/c reserveToncoinsOnBalance (check)
        rbactl.builder.message.in.executeBatch
          .encode({
            queryId: 2n,
            predecessor: proposePredecessor + 1n, // wrong predecessor
            salt: 0n,
            calls,
          })
          .asCell(),
      )
      expect(r2.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.timelock.address,
        exitCode: rbactl.Error.OperationNotReady,
      })

      // succeeds once we use right predecessor
      const r3 = await bind.timelock.sendInternal(
        acc.deployer.getSender(),
        toNano('0.80'), // TODO: notice the gas value required to pass is higher b/c reserveToncoinsOnBalance (check)
        rbactl.builder.message.in.executeBatch
          .encode({
            queryId: 3n,
            predecessor: proposePredecessor,
            salt: 0n,
            calls,
          })
          .asCell(),
      )

      expect(r3.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.timelock.address,
        success: true,
      })

      expect(await bind.counter.getValue()).toEqual(4)
    }

    proposePredecessor = callsHash

    {
      //
      // halve minDelay from bypasser
      //
      const newDelay = Math.floor(Number(MIN_DELAY / 2n))
      calls = asSnakeData<rbactl.Call>(
        [
          {
            target: bind.timelock.address,
            value: toNano('0.05'),
            data: rbactl.builder.message.in.updateDelay.encode({ queryId: 1n, newDelay }).asCell(),
          },
        ],
        (c) => rbactl.builder.data.call.encode(c),
      )

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: proposePredecessor,
        salt: 0n,
      }
      callsHash = await bind.timelock.getHashOperationBatch(operationBatch)

      const signers = signerKeyPairs.map((v) => ({
        publicKey: v.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, v.secretKey),
      }))
      const validUntil = BigInt(blockchain.now || 0) + 2n * 60n * 60n // block.timestamp + 2 hours
      const metadata = {
        chainId,
        multiSig: bind.mcmsBypass.address,
        preOpCount: 0n,
        postOpCount: 1n,
        overridePreviousRoot: false,
      }
      const ops: mcms.Op[] = [
        {
          chainId,
          multiSig: bind.mcmsBypass.address,
          nonce: 0n,
          to: bind.timelock.address,
          value: toNano('0.05'),
          data: rbactl.builder.message.in.bypasserExecuteBatch
            .encode({ queryId: 1n, calls })
            .asCell(),
        },
      ]

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        validUntil,
        metadata,
        ops,
        OP_FINALIZATION_TIMEOUT_ZERO,
      )

      const r = await bind.mcmsBypass.sendInternal(
        acc.deployer.getSender(),
        toNano('0.20'),
        mcms.builder.message.in.setRoot.encode(setRoot).asCell(),
      )

      expect(r.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsBypass.address,
        success: true,
      })

      const r1 = await bind.mcmsBypass.sendInternal(
        acc.deployer.getSender(),
        toNano('0.10'),
        mcms.builder.message.in.execute
          .encode({
            queryId: 1n,
            op: mcms.builder.data.op.encode(ops[0]).asCell(),
            proof: opProofs[0],
          })
          .asCell(),
      )

      expect(r1.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsBypass.address,
        success: true,
      })

      expect(r1.transactions).toHaveTransaction({
        from: bind.mcmsBypass.address,
        to: bind.timelock.address,
        success: true,
        op: rbactl.opcodes.in.BypasserExecuteBatch,
      })

      expect(r1.transactions).toHaveTransaction({
        from: bind.timelock.address,
        to: bind.timelock.address,
        success: true,
        op: rbactl.opcodes.in.UpdateDelay,
      })

      expect(await bind.timelock.getMinDelay()).toEqual(BigInt(newDelay))
    }

    {
      //
      // propose a malicious timelock owner, who is then vetoed
      //
      const evil = Address.parse('UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ')

      {
        // Notice: we need to add funds or test fails with 'Not enough Toncoin'
        const body = Cell.EMPTY
        const r = await bind.mcmsPropose.sendInternal(
          acc.deployer.getSender(),
          toNano('1.00'),
          body,
        )
        expect(r.transactions).toHaveTransaction({
          from: acc.deployer.address,
          to: bind.mcmsPropose.address,
          success: true,
        })
      }

      calls = asSnakeData<rbactl.Call>(
        [
          {
            target: bind.timelock.address,
            value: toNano('0.05'),
            data: ac.builder.message.in.grantRole
              .encode({
                queryId: 1n,
                role: rbactl.roles.admin,
                account: evil,
              })
              .asCell(),
          },
        ],
        (c) => rbactl.builder.data.call.encode(c),
      )

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: proposePredecessor,
        salt: 0n,
      }
      callsHash = await bind.timelock.getHashOperationBatch(operationBatch)

      const signers = proposerKeyPairs().map((v) => ({
        publicKey: v.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, v.secretKey),
      }))
      const validUntil = BigInt(blockchain.now || 0) + 2n * 60n * 60n // block.timestamp + 2 hours
      const metadata = {
        chainId,
        multiSig: bind.mcmsPropose.address,
        preOpCount: 2n,
        postOpCount: 3n,
        overridePreviousRoot: false,
      }
      const ops: mcms.Op[] = [
        {
          chainId,
          multiSig: bind.mcmsPropose.address,
          nonce: 2n,
          to: bind.timelock.address,
          value: toNano('0.05'),
          data: rbactl.builder.message.in.scheduleBatch
            .encode({
              queryId: 1n,
              calls,
              predecessor: proposePredecessor,
              salt: 0n,
              delay: MIN_DELAY,
            })
            .asCell(),
        },
      ]

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        validUntil,
        metadata,
        ops,
        OP_FINALIZATION_TIMEOUT_ZERO,
      )

      const r = await bind.mcmsPropose.sendInternal(
        acc.deployer.getSender(),
        toNano('0.20'),
        mcms.builder.message.in.setRoot.encode(setRoot).asCell(),
      )

      expect(r.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        success: true,
      })

      const r1 = await bind.mcmsPropose.sendInternal(
        acc.deployer.getSender(),
        toNano('0.10'),
        mcms.builder.message.in.execute
          .encode({
            queryId: 1n,
            op: mcms.builder.data.op.encode(ops[0]).asCell(),
            proof: opProofs[0],
          })
          .asCell(),
      )

      expect(r1.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        success: true,
      })

      const r2 = await bind.timelock.sendInternal(
        acc.deployer.getSender(),
        toNano('0.10'),
        rbactl.builder.message.in.executeBatch
          .encode({
            queryId: 1n,
            predecessor: proposePredecessor,
            salt: 0n,
            calls,
          })
          .asCell(),
      )

      expect(r2.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.timelock.address,
        success: false,
        exitCode: rbactl.Error.OperationNotReady,
      })

      blockchain.now = blockchain.now! + Number(MIN_DELAY) / 4

      {
        const signers = vetoKeyPairs().map((v) => ({
          publicKey: v.publicKey,
          sign: (data: Buffer<ArrayBufferLike>) => sign(data, v.secretKey),
        }))
        const validUntil = BigInt(blockchain.now || 0) + 2n * 60n * 60n // block.timestamp + 2 hours
        const metadata = {
          chainId,
          multiSig: bind.mcmsVeto.address,
          preOpCount: 0n,
          postOpCount: 1n,
          overridePreviousRoot: false,
        }
        const ops: mcms.Op[] = [
          {
            chainId,
            multiSig: bind.mcmsVeto.address,
            nonce: 0n,
            to: bind.timelock.address,
            value: toNano('0.05'),
            data: rbactl.builder.message.in.cancel.encode({ queryId: 1n, id: callsHash }).asCell(),
          },
        ]

        const [setRoot, opProofs] = merkleProof.build(
          signers,
          validUntil,
          metadata,
          ops,
          OP_FINALIZATION_TIMEOUT_ZERO,
        )

        const r = await bind.mcmsVeto.sendInternal(
          acc.deployer.getSender(),
          toNano('0.10'),
          mcms.builder.message.in.setRoot.encode(setRoot).asCell(),
        )

        expect(r.transactions).toHaveTransaction({
          from: acc.deployer.address,
          to: bind.mcmsVeto.address,
          success: true,
        })

        const r1 = await bind.mcmsVeto.sendInternal(
          acc.deployer.getSender(),
          toNano('0.10'),
          mcms.builder.message.in.execute
            .encode({
              queryId: 1n,
              op: mcms.builder.data.op.encode(ops[0]).asCell(),
              proof: opProofs[0],
            })
            .asCell(),
        )

        expect(r1.transactions).toHaveTransaction({
          from: acc.deployer.address,
          to: bind.mcmsVeto.address,
          success: true,
        })

        // TODO: verify emit Cancelled(callsHash);

        blockchain.now = blockchain.now! + Number(MIN_DELAY)

        const r2 = await bind.timelock.sendInternal(
          acc.deployer.getSender(),
          toNano('0.10'),
          rbactl.builder.message.in.executeBatch
            .encode({
              queryId: 1n,
              predecessor: proposePredecessor,
              salt: 0n,
              calls,
            })
            .asCell(),
        )

        expect(r2.transactions).toHaveTransaction({
          from: acc.deployer.address,
          to: bind.timelock.address,
          success: false,
          exitCode: rbactl.Error.OperationNotReady,
        })
      }
    }

    {
      //
      // decrease quorum for vetoers & proposers
      //

      calls = asSnakeData<rbactl.Call>(
        [
          {
            target: bind.mcmsPropose.address,
            value: toNano('0.2'),
            data: mcms.builder.message.in.setConfig
              .encode({
                queryId: 1n,
                signerKeys: proposerKeyPairs().map((v) => uint8ArrayToBigInt(v.publicKey)),
                signerGroups: Array(PROPOSE_COUNT).fill(0),
                groupQuorums: new Map(
                  Array.from({ length: MCMS_NUM_GROUPS }, (_, i) => [i, 0]),
                ).set(0, PROPOSE_QUORUM - 1),
                groupParents: new Map(Array.from({ length: MCMS_NUM_GROUPS }, (_, i) => [i, 0])),
                clearRoot: false,
              })
              .asCell(),
          },
          {
            target: bind.mcmsVeto.address,
            value: toNano('0.2'),
            data: mcms.builder.message.in.setConfig
              .encode({
                queryId: 1n,
                signerKeys: vetoKeyPairs().map((v) => uint8ArrayToBigInt(v.publicKey)),
                signerGroups: Array(VETO_COUNT).fill(0),
                groupQuorums: new Map(
                  Array.from({ length: MCMS_NUM_GROUPS }, (_, i) => [i, 0]),
                ).set(0, VETO_QUORUM - 1),
                groupParents: new Map(Array.from({ length: MCMS_NUM_GROUPS }, (_, i) => [i, 0])),
                clearRoot: false,
              })
              .asCell(),
          },
        ],
        (c) => rbactl.builder.data.call.encode(c),
      )

      const operationBatch: rbactl.OperationBatch = {
        calls,
        predecessor: proposePredecessor,
        salt: 0n,
      }
      callsHash = await bind.timelock.getHashOperationBatch(operationBatch)

      const signers = proposerKeyPairs().map((v) => ({
        publicKey: v.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, v.secretKey),
      }))
      const validUntil = BigInt(blockchain.now || 0) + 2n * 60n * 60n // block.timestamp + 2 hours
      const metadata = {
        chainId,
        multiSig: bind.mcmsPropose.address,
        preOpCount: 3n,
        postOpCount: 4n,
        overridePreviousRoot: false,
      }
      const ops: mcms.Op[] = [
        {
          chainId,
          multiSig: bind.mcmsPropose.address,
          nonce: 3n,
          to: bind.timelock.address,
          value: toNano('0.05'),
          data: rbactl.builder.message.in.scheduleBatch
            .encode({
              queryId: 1n,
              calls,
              predecessor: proposePredecessor,
              salt: 0n,
              delay: MIN_DELAY,
            })
            .asCell(),
        },
      ]

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        validUntil,
        metadata,
        ops,
        OP_FINALIZATION_TIMEOUT_ZERO,
      )

      const r = await bind.mcmsPropose.sendInternal(
        acc.deployer.getSender(),
        toNano('0.10'),
        mcms.builder.message.in.setRoot.encode(setRoot).asCell(),
      )

      expect(r.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        success: true,
      })

      const r1 = await bind.mcmsPropose.sendInternal(
        acc.deployer.getSender(),
        toNano('0.10'),
        mcms.builder.message.in.execute
          .encode({
            queryId: 1n,
            op: mcms.builder.data.op.encode(ops[0]).asCell(),
            proof: opProofs[0],
          })
          .asCell(),
      )

      expect(r1.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.mcmsPropose.address,
        success: true,
      })

      blockchain.now = blockchain.now! + Number(MIN_DELAY)

      const r2 = await bind.timelock.sendInternal(
        acc.deployer.getSender(),
        toNano('0.80'), // TODO: notice the gas value required to pass is higher b/c reserveToncoinsOnBalance (check)
        rbactl.builder.message.in.executeBatch
          .encode({
            queryId: 2n,
            predecessor: proposePredecessor,
            salt: 0n,
            calls,
          })
          .asCell(),
      )

      expect(r2.transactions).toHaveTransaction({
        from: acc.deployer.address,
        to: bind.timelock.address,
        success: true,
      })

      expect((await bind.mcmsPropose.getConfig()).groupQuorums.get(0)).toEqual(PROPOSE_QUORUM - 1)
      expect((await bind.mcmsVeto.getConfig()).groupQuorums.get(0)).toEqual(VETO_QUORUM - 1)
    }

    proposePredecessor = callsHash
  }, 20_000) // test can take a while
})
