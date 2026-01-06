import '@ton/test-utils'
import { toNano } from '@ton/core'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'

import { DUMMY_ADDRESS } from '../../src/utils'
import * as mcms from '../../wrappers/mcms/MCMS'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'

import { MCMSBaseSetRootAndExecuteTestSetup, MCMSTestCode } from './ManyChainMultiSigBaseTest'

describe('MCMS - ManyChainMultiSigExecuteErrorOracleTest', () => {
  let baseTest: MCMSBaseSetRootAndExecuteTestSetup

  let acc: {
    oracle: SandboxContract<TreasuryContract>
  }

  beforeAll(async () => {
    baseTest = await MCMSBaseSetRootAndExecuteTestSetup.beforeAll('execute_error_oracle')
  })

  beforeEach(async () => {
    await baseTest.beforeEach()
    acc = { oracle: await baseTest.blockchain.treasury('oracle') }
  })

  const _setupOracleRole = async () => {
    const r = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(),
      toNano('1'),
      mcms.builder.message.in.transferOracleRole
        .encode({
          queryId: 1n,
          newOracle: acc.oracle.address,
        })
        .asCell(),
    )

    expect(r.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    expect(await baseTest.bind.mcms.getOracle()).toEqualAddress(acc.oracle.address)
  }

  it('should allow owner to transfer oracle role', async () => {
    expect(await baseTest.bind.mcms.getOracle()).toEqualAddress(DUMMY_ADDRESS)

    await _setupOracleRole()
  })

  it('should fail to transfer oracle role if not owner', async () => {
    expect(await baseTest.bind.mcms.getOracle()).toEqualAddress(DUMMY_ADDRESS)

    const r = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      mcms.builder.message.in.transferOracleRole
        .encode({
          queryId: 1n,
          newOracle: acc.oracle.address,
        })
        .asCell(),
    )

    expect(r.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: ownable2step.Errors.OnlyCallableByOwner,
    })

    expect(await baseTest.bind.mcms.getOracle()).toEqualAddress(DUMMY_ADDRESS)
  })

  it('should allow oracle to submit an error report and expire root', async () => {
    await _setupOracleRole()

    // Execute first operation
    const proof1 = baseTest.getProofForOp(0)

    const execBody = mcms.builder.message.in.execute
      .encode({
        queryId: 1n,
        op: mcms.builder.data.op.encode(baseTest.testOps[0]).asCell(),
        proof: proof1,
      })
      .asCell()

    const r1 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      execBody,
    )

    expect(r1.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Check that the op count was incremented
    const opCount = await baseTest.bind.mcms.getOpCount()
    expect(opCount).toEqual(baseTest.testOps[0].nonce + 1n)

    // Submit an error report
    const txHash = BigInt('0x' + r1.transactions[0].hash().toString('hex'))

    const r2 = await baseTest.bind.mcms.sendInternal(
      acc.oracle.getSender(),
      toNano('1'),
      mcms.builder.message.in.submitErrorReport
        .encode({
          queryId: 1n,
          op: mcms.builder.data.op.encode(baseTest.testOps[0]).asCell(),
          proof: proof1,
          opTxHash: txHash,
          errorTxHash: txHash,
          errorCode: 1337,
        })
        .asCell(),
    )

    expect(r2.transactions).toHaveTransaction({
      from: acc.oracle.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Try to re-execute the same op - should fail with WrongNonce
    const r3 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      execBody,
    )

    expect(r3.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.RootExpired,
    })
  })

  it('should allow setRoot (new) after an error report was submitted', async () => {
    await _setupOracleRole()

    // Execute first operation
    const proof1 = baseTest.getProofForOp(0)

    const execBody = mcms.builder.message.in.execute
      .encode({
        queryId: 1n,
        op: mcms.builder.data.op.encode(baseTest.testOps[0]).asCell(),
        proof: proof1,
      })
      .asCell()

    const r1 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      execBody,
    )

    expect(r1.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Check that the op count was incremented
    const opCount = await baseTest.bind.mcms.getOpCount()
    expect(opCount).toEqual(baseTest.testOps[0].nonce + 1n)

    // Submit an error report
    const txHash = BigInt('0x' + r1.transactions[0].hash().toString('hex'))

    const r2 = await baseTest.bind.mcms.sendInternal(
      acc.oracle.getSender(),
      toNano('1'),
      mcms.builder.message.in.submitErrorReport
        .encode({
          queryId: 1n,
          op: mcms.builder.data.op.encode(baseTest.testOps[0]).asCell(),
          proof: proof1,
          opTxHash: txHash,
          errorTxHash: txHash,
          errorCode: 1337,
        })
        .asCell(),
    )

    expect(r2.transactions).toHaveTransaction({
      from: acc.oracle.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Create and publish a new root
    const includeRevertingOp = false
    const startNonce = 1
    baseTest.testOps = baseTest.createTestOps(
      MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM,
      includeRevertingOp,
      startNonce,
    )
    await baseTest.setInitialRoot(
      baseTest.createTestRootMetadata(
        1n,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM),
        true, // override root
      ),
    )

    // Try to execute the new op, new root
    const proofNew = baseTest.getProofForOp(0)

    const execBodyNew = mcms.builder.message.in.execute
      .encode({
        queryId: 1n,
        op: mcms.builder.data.op.encode(baseTest.testOps[0]).asCell(),
        proof: proofNew,
      })
      .asCell()

    const r3 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      execBodyNew,
    )

    expect(r3.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })
  })

  it('should fail to submit error report if not oracle', async () => {
    await _setupOracleRole()

    // Submit an error report
    const proof = baseTest.getProofForOp(0)
    const txHash = 13n

    const r = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.multisigOwner.getSender(), // not an oracle
      toNano('1'),
      mcms.builder.message.in.submitErrorReport
        .encode({
          queryId: 1n,
          op: mcms.builder.data.op.encode(baseTest.testOps[0]).asCell(),
          proof,
          opTxHash: txHash,
          errorTxHash: txHash,
          errorCode: 1337,
        })
        .asCell(),
    )

    expect(r.transactions).toHaveTransaction({
      from: baseTest.acc.multisigOwner.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.UnauthorizedOracle,
    })
  })

  it('should fail to submit error report if op not part of the current root', async () => {
    await _setupOracleRole()

    // Submit an error report
    const invalidProof = [0n, 1n, 2n, 3n]
    const txHash = 13n

    const r = await baseTest.bind.mcms.sendInternal(
      acc.oracle.getSender(),
      toNano('1'),
      mcms.builder.message.in.submitErrorReport
        .encode({
          queryId: 1n,
          op: mcms.builder.data.op.encode(baseTest.testOps[0]).asCell(),
          proof: invalidProof,
          opTxHash: txHash,
          errorTxHash: txHash,
          errorCode: 1337,
        })
        .asCell(),
    )

    expect(r.transactions).toHaveTransaction({
      from: acc.oracle.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.ProofCannotBeVerified,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await baseTest.generateCoverageArtifacts()
    }
  })
})
