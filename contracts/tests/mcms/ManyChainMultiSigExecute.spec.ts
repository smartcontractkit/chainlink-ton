import { Cell, toNano } from '@ton/core'
import '@ton/test-utils'
import { MCMSBaseSetRootAndExecuteTestSetup, MCMSTestCode } from './ManyChainMultiSigBaseTest'
import * as mcms from '../../wrappers/mcms/MCMS'
import { ZERO_ADDRESS } from '../../src/utils'

describe('MCMS - ManyChainMultiSigExecuteTest', () => {
  let baseTest: MCMSBaseSetRootAndExecuteTestSetup
  let code: MCMSTestCode

  beforeAll(async () => {
    code = await MCMSBaseSetRootAndExecuteTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new MCMSBaseSetRootAndExecuteTestSetup()
    baseTest.code = code
    await baseTest.setupForSetRootAndExecute('test-execute')
    await baseTest.setInitialRoot()
  })

  it('should revert when post-op count reached', async () => {
    // Fund for value op
    await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('10'),
      Cell.EMPTY,
    )

    await baseTest.recreateTestOpsNoRevertingOp()
    await baseTest.executeOperationsUpTo(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM)

    // Verify we've reached the post-op count
    const currentOpCount = await baseTest.bind.mcms.getOpCount()
    expect(Number(currentOpCount)).toEqual(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM)

    // Now try to execute one more operation - should fail with PostOpCountReached
    // Use any operation and proof - they won't even be checked
    const fakeOp = baseTest.testOps[0]

    const executeBody = mcms.builder.message.in.execute
      .encode({
        queryId: 999n,
        op: mcms.builder.data.op.encode(fakeOp).asCell(),
        proof: [], // fakeProof
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.PostOpCountReached,
    })
  })

  it('should revert on bad proof', async () => {
    // Modify the first op by incrementing value
    const modifiedOp = { ...baseTest.testOps[0] }
    modifiedOp.value = modifiedOp.value + 1n

    // Try with empty proof first
    const executeBody1 = mcms.builder.message.in.execute
      .encode({
        queryId: 1n,
        op: mcms.builder.data.op.encode(modifiedOp).asCell(),
        proof: [], // emptyProof
      })
      .asCell()

    const result1 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody1,
    )

    expect(result1.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.ProofCannotBeVerified,
    })

    // Send a proof for the original op before the modification - should still fail
    const originalProof = baseTest.getProofForOp(0)

    const executeBody2 = mcms.builder.message.in.execute
      .encode({
        queryId: 2n,
        op: mcms.builder.data.op.encode(modifiedOp).asCell(),
        proof: originalProof,
      })
      .asCell()

    const result2 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody2,
    )

    expect(result2.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.ProofCannotBeVerified,
    })
  })

  it('should revert on bad op data', async () => {
    // Create a dummy proof (5 elements as in original test)
    const dummyProof = [1n, 2n, 3n, 4n, 5n]

    // Test 1: Wrong chain ID
    const wrongChainIdOp = { ...baseTest.testOps[0] }
    wrongChainIdOp.chainId = wrongChainIdOp.chainId + 1n

    const executeBody1 = mcms.builder.message.in.execute
      .encode({
        queryId: 1n,
        op: mcms.builder.data.op.encode(wrongChainIdOp).asCell(),
        proof: dummyProof,
      })
      .asCell()

    const result1 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody1,
    )

    expect(result1.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.WrongChainId,
    })

    // Test 2: Wrong multiSig address
    const wrongMultiSigOp = { ...baseTest.testOps[0] }
    wrongMultiSigOp.multiSig = baseTest.acc.multisigOwner.address

    const executeBody2 = mcms.builder.message.in.execute
      .encode({
        queryId: 2n,
        op: mcms.builder.data.op.encode(wrongMultiSigOp).asCell(),
        proof: dummyProof,
      })
      .asCell()

    const result2 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody2,
    )

    expect(result2.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.WrongMultiSig,
    })

    // Test 3: Wrong nonce
    const wrongNonceOp = { ...baseTest.testOps[0] }
    wrongNonceOp.nonce = wrongNonceOp.nonce + 1n

    const executeBody3 = mcms.builder.message.in.execute
      .encode({
        queryId: 3n,
        op: mcms.builder.data.op.encode(wrongNonceOp).asCell(),
        proof: dummyProof,
      })
      .asCell()

    const result3 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody3,
    )

    expect(result3.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.WrongNonce,
    })

    // Test 4: Expired root (advance time past validUntil)
    baseTest.warpTime(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL + 1)

    const executeBody4 = mcms.builder.message.in.execute
      .encode({
        queryId: 4n,
        op: mcms.builder.data.op.encode(baseTest.testOps[0]).asCell(),
        proof: dummyProof,
      })
      .asCell()

    const result4 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody4,
    )

    expect(result4.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.RootExpired,
    })
  })

  it('should execute ops in order', async () => {
    // Execute first operation
    const proof1 = baseTest.getProofForOp(0)

    const executeBody1 = mcms.builder.message.in.execute
      .encode({
        queryId: 1n,
        op: mcms.builder.data.op.encode(baseTest.testOps[0]).asCell(),
        proof: proof1,
      })
      .asCell()

    const result1 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody1,
    )

    expect(result1.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Check that the op count was incremented
    const opCount1 = await baseTest.bind.mcms.getOpCount()
    expect(opCount1).toEqual(baseTest.testOps[0].nonce + 1n)

    // Try to re-execute the same op - should fail with WrongNonce
    const result1Retry = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody1,
    )

    expect(result1Retry.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.WrongNonce,
    })

    // Try to execute the third op instead of the second - should fail with WrongNonce
    const proof3 = baseTest.getProofForOp(2)

    const executeBody3 = mcms.builder.message.in.execute
      .encode({
        queryId: 3n,
        op: mcms.builder.data.op.encode(baseTest.testOps[2]).asCell(),
        proof: proof3,
      })
      .asCell()

    const result3Early = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody3,
    )

    expect(result3Early.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.WrongNonce,
    })

    // Execute the second op correctly
    const proof2 = baseTest.getProofForOp(1)

    const executeBody2 = mcms.builder.message.in.execute
      .encode({
        queryId: 2n,
        op: mcms.builder.data.op.encode(baseTest.testOps[1]).asCell(),
        proof: proof2,
      })
      .asCell()

    const result2 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody2,
    )

    expect(result2.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Check that the op count was incremented again
    const opCount2 = await baseTest.bind.mcms.getOpCount()
    expect(opCount2).toEqual(baseTest.testOps[1].nonce + 1n)
  })

  // TODO mcms doesn't handle bounced messages yet
  it('should revert on failed op', async () => {
    // Execute operations up to the reverting op index
    await baseTest.executeOperationsUpTo(MCMSBaseSetRootAndExecuteTestSetup.REVERTING_OP_INDEX)

    // Verify we're at the correct op count
    let currentOpCount = await baseTest.bind.mcms.getOpCount()
    expect(currentOpCount).toEqual(BigInt(MCMSBaseSetRootAndExecuteTestSetup.REVERTING_OP_INDEX))

    // Now try to execute the reverting operation
    const proof = baseTest.getProofForOp(MCMSBaseSetRootAndExecuteTestSetup.REVERTING_OP_INDEX)

    const executeBody = mcms.builder.message.in.execute
      .encode({
        queryId: BigInt(MCMSBaseSetRootAndExecuteTestSetup.REVERTING_OP_INDEX + 1),
        op: mcms.builder.data.op
          .encode(baseTest.testOps[MCMSBaseSetRootAndExecuteTestSetup.REVERTING_OP_INDEX])
          .asCell(),
        proof,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody,
    )

    // This is the failure of the counter
    expect(result.transactions).toHaveTransaction({
      from: baseTest.bind.mcms.address,
      to: baseTest.bind.counter.address,
      success: false,
      exitCode: 0xffff, // Unknown opcode
    })

    // TODO check emit or reply with the failed error

    // Verify we're (back) at the correct op count, the error was handled and we can retry
    currentOpCount = await baseTest.bind.mcms.getOpCount()
    expect(currentOpCount).toEqual(BigInt(MCMSBaseSetRootAndExecuteTestSetup.REVERTING_OP_INDEX))

    // Check OpPendingInfo is cleared after a bounce
    const opPendingInfo = await baseTest.bind.mcms.getOpPendingInfo()
    expect(opPendingInfo).toBeDefined()
    expect(opPendingInfo.validAfter).toBeGreaterThan(0)
    expect(opPendingInfo.opPendingReceiver).toEqualAddress(ZERO_ADDRESS)
    expect(opPendingInfo.opPendingBodyTruncated).toEqual(0n)
  })

  it('should handle value operations correctly - insufficient balance', async () => {
    await baseTest.recreateTestOpsNoRevertingOp()

    // Check that MCMS contract has minimal balance initially
    const mcmsContract = await baseTest.blockchain.getContract(baseTest.bind.mcms.address)
    expect(mcmsContract.balance).toBeLessThanOrEqual(toNano('2')) // Should be very low (just deployment funds)

    // Execute operations up to the value operation index
    await baseTest.executeOperationsUpTo(MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX)

    // Verify we're at the correct op count
    const currentOpCount = await baseTest.bind.mcms.getOpCount()
    expect(currentOpCount).toEqual(BigInt(MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX))

    // Check that MCMS contract still has balance left
    // Notice: each operation adds 1 TON and executes using 0.10 TON
    expect(mcmsContract.balance).toBeLessThanOrEqual(toNano('8')) // 2 + MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX

    // Try to execute value operation without sufficient balance
    const proof = baseTest.getProofForOp(MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX)

    const executeBody = mcms.builder.message.in.execute
      .encode({
        queryId: BigInt(MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX + 1),
        op: mcms.builder.data.op
          .encode(baseTest.testOps[MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX])
          .asCell(),
        proof,
      })
      .asCell()

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody,
    )

    // Should fail due to insufficient balance
    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      // Error will depend on TON's insufficient balance handling
    })
  })

  it('should handle value operations correctly - with sufficient balance', async () => {
    await baseTest.recreateTestOpsNoRevertingOp()

    // Execute operations up to the value operation index
    await baseTest.executeOperationsUpTo(MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX)

    // Get the target address balance before executing the value operation
    const valueOp = baseTest.testOps[MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX]
    const targetContractBefore = await baseTest.blockchain.getContract(valueOp.to)
    const targetBalanceBefore = targetContractBefore.balance

    // Execute the value operation
    const proof = baseTest.getProofForOp(MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX)

    const executeBody = mcms.builder.message.in.execute
      .encode({
        queryId: BigInt(MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX + 1),
        op: mcms.builder.data.op
          .encode(baseTest.testOps[MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX])
          .asCell(),
        proof,
      })
      .asCell()

    // TopUp contract before execution operation
    await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('10'),
      Cell.EMPTY,
    )

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody,
    )

    // Should succeed
    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: true,
    })

    // Check that value was transferred to the target
    const targetContractAfter = await baseTest.blockchain.getContract(valueOp.to)
    const targetBalanceAfter = targetContractAfter.balance
    expect(targetBalanceAfter).toBeGreaterThan(targetBalanceBefore)

    // Verify the specific amount was transferred (0.1 TON)
    const expectedTransfer = toNano('0.1')
    expect(targetBalanceAfter).toBeGreaterThanOrEqual(
      targetBalanceBefore + expectedTransfer - toNano('0.01'),
    ) // Allow for small gas fees
  })
})
