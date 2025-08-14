import { toNano, beginCell } from '@ton/core'
import '@ton/test-utils'
import { MCMSBaseSetRootAndExecuteTestSetup, MCMSTestCode } from './ManyChainMultiSigBaseTest'
import * as mcms from '../../wrappers/mcms/MCMS'
import { asSnakeData } from '../../src/utils'

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
    // Execute all operations up to the post-op count limit to simulate setOpCount
    const targetOpCount = baseTest.initialTestRootMetadata.postOpCount

    for (let i = 0; i < Number(targetOpCount) && i < baseTest.testOps.length; i++) {
      const proof = baseTest.getProofForOp(i)
      const proofCell = asSnakeData<bigint>(proof, (v) => beginCell().storeUint(v, 256))

      const executeBody = mcms.builder.message.in.execute.encode({
        queryId: BigInt(i + 1),
        op: mcms.builder.data.op.encode(baseTest.testOps[i]),
        proof: proofCell,
      })

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('1'),
        executeBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: true,
      })
    }

    // Verify we've reached the post-op count
    const currentOpCount = await baseTest.bind.mcms.getOpCount()
    expect(currentOpCount).toEqual(targetOpCount)

    // Now try to execute one more operation - should fail with PostOpCountReached
    // Use any operation and proof - they won't even be checked
    const fakeOp = baseTest.testOps[0]
    const fakeProof = asSnakeData<bigint>([], (v) => beginCell().storeUint(v, 256))

    const executeBody = mcms.builder.message.in.execute.encode({
      queryId: 999n,
      op: mcms.builder.data.op.encode(fakeOp),
      proof: fakeProof,
    })

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody,
    )

    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.POST_OP_COUNT_REACHED,
    })
  })

  it('should revert on bad proof', async () => {
    // Modify the first op by incrementing value
    const modifiedOp = { ...baseTest.testOps[0] }
    modifiedOp.value = modifiedOp.value + 1n

    // Try with empty proof first
    const emptyProof = asSnakeData<bigint>([], (v) => beginCell().storeUint(v, 256))

    const executeBody1 = mcms.builder.message.in.execute.encode({
      queryId: 1n,
      op: mcms.builder.data.op.encode(modifiedOp),
      proof: emptyProof,
    })

    const result1 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody1,
    )

    expect(result1.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.PROOF_CANNOT_BE_VERIFIED,
    })

    // Send a proof for the original op before the modification - should still fail
    const originalProof = baseTest.getProofForOp(0)
    const proofCell = asSnakeData<bigint>(originalProof, (v) => beginCell().storeUint(v, 256))

    const executeBody2 = mcms.builder.message.in.execute.encode({
      queryId: 2n,
      op: mcms.builder.data.op.encode(modifiedOp),
      proof: proofCell,
    })

    const result2 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody2,
    )

    expect(result2.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.PROOF_CANNOT_BE_VERIFIED,
    })
  })

  it('should revert on bad op data', async () => {
    // Create a dummy proof (5 elements as in original test)
    const dummyProof = asSnakeData<bigint>([1n, 2n, 3n, 4n, 5n], (v) =>
      beginCell().storeUint(v, 256),
    )

    // Test 1: Wrong chain ID
    const wrongChainIdOp = { ...baseTest.testOps[0] }
    wrongChainIdOp.chainId = wrongChainIdOp.chainId + 1n

    const executeBody1 = mcms.builder.message.in.execute.encode({
      queryId: 1n,
      op: mcms.builder.data.op.encode(wrongChainIdOp),
      proof: dummyProof,
    })

    const result1 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody1,
    )

    expect(result1.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.WRONG_CHAIN_ID,
    })

    // Test 2: Wrong multiSig address
    const wrongMultiSigOp = { ...baseTest.testOps[0] }
    wrongMultiSigOp.multiSig = baseTest.acc.multisigOwner.address

    const executeBody2 = mcms.builder.message.in.execute.encode({
      queryId: 2n,
      op: mcms.builder.data.op.encode(wrongMultiSigOp),
      proof: dummyProof,
    })

    const result2 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody2,
    )

    expect(result2.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.WRONG_MULTI_SIG,
    })

    // Test 3: Wrong nonce
    const wrongNonceOp = { ...baseTest.testOps[0] }
    wrongNonceOp.nonce = wrongNonceOp.nonce + 1n

    const executeBody3 = mcms.builder.message.in.execute.encode({
      queryId: 3n,
      op: mcms.builder.data.op.encode(wrongNonceOp),
      proof: dummyProof,
    })

    const result3 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody3,
    )

    expect(result3.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.WRONG_NONCE,
    })

    // Test 4: Expired root (advance time past validUntil)
    baseTest.warpTime(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL + 1)

    const executeBody4 = mcms.builder.message.in.execute.encode({
      queryId: 4n,
      op: mcms.builder.data.op.encode(baseTest.testOps[0]),
      proof: dummyProof,
    })

    const result4 = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody4,
    )

    expect(result4.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.ROOT_EXPIRED,
    })
  })

  it('should execute ops in order', async () => {
    // Execute first operation
    const proof1 = baseTest.getProofForOp(0)
    const proofCell1 = asSnakeData<bigint>(proof1, (v) => beginCell().storeUint(v, 256))

    const executeBody1 = mcms.builder.message.in.execute.encode({
      queryId: 1n,
      op: mcms.builder.data.op.encode(baseTest.testOps[0]),
      proof: proofCell1,
    })

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
      exitCode: mcms.Error.WRONG_NONCE,
    })

    // Try to execute the third op instead of the second - should fail with WrongNonce
    const proof3 = baseTest.getProofForOp(2)
    const proofCell3 = asSnakeData<bigint>(proof3, (v) => beginCell().storeUint(v, 256))

    const executeBody3 = mcms.builder.message.in.execute.encode({
      queryId: 3n,
      op: mcms.builder.data.op.encode(baseTest.testOps[2]),
      proof: proofCell3,
    })

    const result3Early = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody3,
    )

    expect(result3Early.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      exitCode: mcms.Error.WRONG_NONCE,
    })

    // Execute the second op correctly
    const proof2 = baseTest.getProofForOp(1)
    const proofCell2 = asSnakeData<bigint>(proof2, (v) => beginCell().storeUint(v, 256))

    const executeBody2 = mcms.builder.message.in.execute.encode({
      queryId: 2n,
      op: mcms.builder.data.op.encode(baseTest.testOps[1]),
      proof: proofCell2,
    })

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

  // NOTE: This test is skipped because we don't have a Receiver contract that can revert
  it.skip('should revert on failed op', async () => {
    // Execute operations up to the reverting op index
    // This simulates setOpCount(REVERTING_OP_INDEX) in the original test
    const revertingOpIndex = MCMSBaseSetRootAndExecuteTestSetup.REVERTING_OP_INDEX

    for (let i = 0; i < revertingOpIndex; i++) {
      const proof = baseTest.opProofs[i]
      const proofCell = asSnakeData<bigint>(proof, (v) => beginCell().storeUint(v, 256))

      const executeBody = mcms.builder.message.in.execute.encode({
        queryId: BigInt(i + 1),
        op: mcms.builder.data.op.encode(baseTest.testOps[i]),
        proof: proofCell,
      })

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('1'),
        executeBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: true,
      })
    }

    // Verify we're at the correct op count
    const currentOpCount = await baseTest.bind.mcms.getOpCount()
    expect(currentOpCount).toEqual(BigInt(revertingOpIndex))

    // Now try to execute the reverting operation
    const proof = baseTest.getProofForOp(revertingOpIndex)
    const proofCell = asSnakeData<bigint>(proof, (v) => beginCell().storeUint(v, 256))

    const executeBody = mcms.builder.message.in.execute.encode({
      queryId: BigInt(revertingOpIndex + 1),
      op: mcms.builder.data.op.encode(baseTest.testOps[revertingOpIndex]),
      proof: proofCell,
    })

    const result = await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('1'),
      executeBody,
    )

    // The operation should fail because it's designed to revert
    // The exact error code will depend on how the reverting operation is structured
    expect(result.transactions).toHaveTransaction({
      from: baseTest.acc.deployer.address,
      to: baseTest.bind.mcms.address,
      success: false,
      // Note: The exact error code depends on the specific reverting operation implementation
      // In the original Solidity test, this checks for CallReverted with the expected return data
    })
  })

  it('should handle value operations correctly - insufficient balance', async () => {
    // Execute operations up to the value operation index
    const valueOpIndex = MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX

    for (let i = 0; i < valueOpIndex; i++) {
      const proof = baseTest.getProofForOp(i)
      const proofCell = asSnakeData<bigint>(proof, (v) => beginCell().storeUint(v, 256))

      const executeBody = mcms.builder.message.in.execute.encode({
        queryId: BigInt(i + 1),
        op: mcms.builder.data.op.encode(baseTest.testOps[i]),
        proof: proofCell,
      })

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('1'),
        executeBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: true,
      })
    }

    // Verify we're at the correct op count
    const currentOpCount = await baseTest.bind.mcms.getOpCount()
    expect(currentOpCount).toEqual(BigInt(valueOpIndex))

    // Check that MCMS contract has minimal balance initially
    const mcmsContract = await baseTest.blockchain.getContract(baseTest.bind.mcms.address)
    const initialBalance = mcmsContract.balance
    expect(initialBalance).toBeLessThanOrEqual(toNano('2')) // Should be very low (just deployment funds)

    // Try to execute value operation without sufficient balance
    const proof = baseTest.getProofForOp(valueOpIndex)
    const proofCell = asSnakeData<bigint>(proof, (v) => beginCell().storeUint(v, 256))

    const executeBody = mcms.builder.message.in.execute.encode({
      queryId: BigInt(valueOpIndex + 1),
      op: mcms.builder.data.op.encode(baseTest.testOps[valueOpIndex]),
      proof: proofCell,
    })

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
    // Execute operations up to the value operation index
    const valueOpIndex = MCMSBaseSetRootAndExecuteTestSetup.VALUE_OP_INDEX

    for (let i = 0; i < valueOpIndex; i++) {
      const proof = baseTest.opProofs[i]
      const proofCell = asSnakeData<bigint>(proof, (v) => beginCell().storeUint(v, 256))

      const executeBody = mcms.builder.message.in.execute.encode({
        queryId: BigInt(i + 1),
        op: mcms.builder.data.op.encode(baseTest.testOps[i]),
        proof: proofCell,
      })

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('1'),
        executeBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: true,
      })
    }

    // Get the target address balance before executing the value operation
    const valueOp = baseTest.testOps[valueOpIndex]
    const targetContractBefore = await baseTest.blockchain.getContract(valueOp.to)
    const targetBalanceBefore = targetContractBefore.balance

    // Execute the value operation
    const proof = baseTest.getProofForOp(valueOpIndex)
    const proofCell = asSnakeData<bigint>(proof, (v) => beginCell().storeUint(v, 256))

    const executeBody = mcms.builder.message.in.execute.encode({
      queryId: BigInt(valueOpIndex + 1),
      op: mcms.builder.data.op.encode(baseTest.testOps[valueOpIndex]),
      proof: proofCell,
    })

    // TopUp contract before execution operation
    await baseTest.bind.mcms.sendInternal(
      baseTest.acc.deployer.getSender(),
      toNano('10'),
      mcms.builder.message.in.topUp.encode({
        queryId: BigInt(1),
      }),
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
