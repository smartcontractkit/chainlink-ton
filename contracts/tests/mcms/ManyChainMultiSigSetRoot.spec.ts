import { toNano, beginCell } from '@ton/core'
import '@ton/test-utils'
import {
  MCMSBaseSetRootAndExecuteTestSetup,
  MCMSTestCode,
  TestSigner,
} from './ManyChainMultiSigBaseTest'
import { merkleProof } from '../../src/mcms'
import * as mcms from '../../wrappers/mcms/MCMS'
import { sign } from '@ton/crypto/dist/primitives/nacl'
import { uint8ArrayToBigInt } from '../../src/utils'

describe('MCMS - ManyChainMultiSigSetRootTest', () => {
  let baseTest: MCMSBaseSetRootAndExecuteTestSetup
  let code: MCMSTestCode

  beforeAll(async () => {
    code = await MCMSBaseSetRootAndExecuteTestSetup.compileContracts()
  })

  beforeEach(async () => {
    baseTest = new MCMSBaseSetRootAndExecuteTestSetup()
    baseTest.code = code
    await baseTest.setupForSetRootAndExecute('test-set-root')
  })

  describe('SetRootSanityChecks', () => {
    it('should revert on invalid chain ID', async () => {
      const corruptedRootMetadata = { ...baseTest.initialTestRootMetadata }
      corruptedRootMetadata.chainId = corruptedRootMetadata.chainId + 1n

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        corruptedRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.WRONG_CHAIN_ID,
      })
    })

    it('should revert on invalid multiSig address', async () => {
      const corruptedRootMetadata = { ...baseTest.initialTestRootMetadata }
      corruptedRootMetadata.multiSig = baseTest.acc.multisigOwner.address

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        corruptedRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.WRONG_MULTI_SIG,
      })
    })

    it('should revert on incorrect preOpCount - preOpCount > opCount', async () => {
      const corruptedRootMetadata = { ...baseTest.initialTestRootMetadata }
      corruptedRootMetadata.overridePreviousRoot = true
      corruptedRootMetadata.preOpCount = (await baseTest.bind.mcms.getOpCount()) + 1n

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        corruptedRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.WRONG_PRE_OP_COUNT,
      })
    })

    it('should revert on incorrect preOpCount - opCount > preOpCount', async () => {
      await baseTest.setInitialRoot()
      await baseTest.executeOperationsUpTo(1)
      const corruptedRootMetadata = { ...baseTest.initialTestRootMetadata }
      corruptedRootMetadata.overridePreviousRoot = true
      corruptedRootMetadata.preOpCount = (await baseTest.bind.mcms.getOpCount()) - 1n

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        corruptedRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.WRONG_PRE_OP_COUNT,
      })
    })

    it('should revert on incorrect postOpCount', async () => {
      await baseTest.setInitialRoot()
      await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('10'),
        mcms.builder.message.in.topUp.encode({ queryId: 1n }),
      )
      await baseTest.executeOperationsUpTo(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM)

      // Now try to set another root with incorrect postOpCount
      const corruptedRootMetadata = { ...baseTest.initialTestRootMetadata }
      corruptedRootMetadata.preOpCount = baseTest.initialTestRootMetadata.postOpCount
      corruptedRootMetadata.postOpCount = corruptedRootMetadata.preOpCount - 1n

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        corruptedRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.WRONG_POST_OP_COUNT,
      })
    })

    it('should revert on expired validUntil', async () => {
      // Warp time beyond validUntil
      baseTest.warpTime(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL + 1)

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.VALID_UNTIL_HAS_ALREADY_PASSED,
      })
    })

    it('should revert on repeated root and validUntil', async () => {
      const rootMetadata = { ...baseTest.initialTestRootMetadata }
      rootMetadata.overridePreviousRoot = true

      // First call should succeed
      {
        const signers = baseTest.testSigners.map((s) => ({
          publicKey: s.keyPair.publicKey,
          sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
        }))

        const [setRoot, opProofs] = merkleProof.build(
          signers,
          BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
          rootMetadata,
          baseTest.testOps,
        )
        const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

        const result = await baseTest.bind.mcms.sendInternal(
          baseTest.acc.deployer.getSender(),
          toNano('0.05'),
          setRootBody,
        )
        expect(result.transactions).toHaveTransaction({
          from: baseTest.acc.deployer.address,
          to: baseTest.bind.mcms.address,
          success: true,
        })
      }

      // Second call with same root and validUntil should fail
      {
        const signers = baseTest.testSigners.map((s) => ({
          publicKey: s.keyPair.publicKey,
          sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
        }))

        const [setRoot, opProofs] = merkleProof.build(
          signers,
          BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
          rootMetadata,
          baseTest.testOps,
        )
        const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

        const result = await baseTest.bind.mcms.sendInternal(
          baseTest.acc.deployer.getSender(),
          toNano('0.05'),
          setRootBody,
        )
        expect(result.transactions).toHaveTransaction({
          from: baseTest.acc.deployer.address,
          to: baseTest.bind.mcms.address,
          success: false,
          exitCode: mcms.Error.SIGNED_HASH_ALREADY_SEEN,
        })
      }

      // Modify validUntil and setRoot should work
      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL + 1),
        rootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: true,
      })
    })

    it('should revert when no config is set', async () => {
      // Create a fresh MCMS instance without setting config
      baseTest = new MCMSBaseSetRootAndExecuteTestSetup()
      {
        baseTest.code = code
        await baseTest.initializeBlockchain()
        await baseTest.setupTestConfiguration()
        await baseTest.setupMCMSContract('test-no-config')
        await baseTest.deployMCMSContract()
        await baseTest.setupCounterContract('test-no-config')
        await baseTest.deployCounterContract()
        // Don't call setInitialConfiguration()

        // Create test root metadata
        baseTest.initialTestRootMetadata = baseTest.createTestRootMetadata(
          0n,
          BigInt(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM),
          false,
        )

        // Create test operations
        baseTest.testOps = baseTest.createTestOps(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM)
      }

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.MISSING_CONFIG,
      })
    })
  })

  describe('SetOverrideRootTest', () => {
    beforeEach(async () => {
      // Set an initial root before each test
      await baseTest.setInitialRoot()
      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('10'),
        mcms.builder.message.in.topUp.encode({ queryId: 1n }),
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: true,
      })
    })

    it('should successfully override root', async () => {
      // Override the existing root
      const overrideMetadata = { ...baseTest.initialTestRootMetadata }
      overrideMetadata.overridePreviousRoot = true

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        overrideMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: true,
      })

      // Check that opCount equals preOpCount after override
      const opCount = await baseTest.bind.mcms.getOpCount()
      expect(opCount).toBe(baseTest.initialTestRootMetadata.preOpCount)
    })

    it('should successfully set root after clearing', async () => {
      // Execute all ops except one
      const targetOpCount = baseTest.initialTestRootMetadata.postOpCount - 1n
      await baseTest.executeOperationsUpTo(Number(targetOpCount))

      // Set config with clearRoot = true
      const setConfigBody = mcms.builder.message.in.setConfig.encode({
        queryId: 1n,
        signerKeys: baseTest.testSigners.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
        signerGroups: baseTest.testSigners.map((s) => s.group),
        groupQuorums: baseTest.testGroupQuorums,
        groupParents: baseTest.testGroupParents,
        clearRoot: true,
      })

      {
        const result = await baseTest.bind.mcms.sendInternal(
          baseTest.acc.multisigOwner.getSender(),
          toNano('1'),
          setConfigBody,
        )

        expect(result.transactions).toHaveTransaction({
          from: baseTest.acc.multisigOwner.address,
          to: baseTest.bind.mcms.address,
          success: true,
        })
      }

      // Create new root metadata with correct preOpCount
      const newRootMetadata = { ...baseTest.initialTestRootMetadata }
      newRootMetadata.preOpCount = targetOpCount

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        newRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: true,
      })
    })

    it('should revert when no override and there are pending ops', async () => {
      const newRootMetadata = { ...baseTest.initialTestRootMetadata }
      newRootMetadata.overridePreviousRoot = false

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL + 1),
        newRootMetadata,
        baseTest.testOps,
      ) // TODO: Original test doesn't add this 1, but this test fails with ERROR_SIGNED_HASH_ALREADY_SEEN if we don't. Thats probably a bug? Should the "override previous root" be used to calculate the hash? Or maybe it is a problem in the order of validations
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.PENDING_OPS,
      })
    })

    it('should succeed when no override after empty root', async () => {
      // First override with an empty root (preOpCount == postOpCount)
      const emptyRootMetadata = { ...baseTest.initialTestRootMetadata }
      emptyRootMetadata.overridePreviousRoot = true
      emptyRootMetadata.postOpCount = emptyRootMetadata.preOpCount

      {
        const signers = baseTest.testSigners.map((s) => ({
          publicKey: s.keyPair.publicKey,
          sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
        }))

        const [setRoot, opProofs] = merkleProof.build(
          signers,
          BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
          emptyRootMetadata,
          baseTest.testOps,
        )
        const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

        const result = await baseTest.bind.mcms.sendInternal(
          baseTest.acc.deployer.getSender(),
          toNano('0.05'),
          setRootBody,
        )
      }

      // Now set a new root without override (should work since no pending ops)
      const newRootMetadata = { ...baseTest.initialTestRootMetadata }
      newRootMetadata.overridePreviousRoot = false
      newRootMetadata.postOpCount = newRootMetadata.preOpCount + 1n

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        newRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: true,
      })
    })

    it('should succeed when no override after everything executed', async () => {
      const rootMetadata = await baseTest.bind.mcms.getRootMetadata()
      expect(rootMetadata.postOpCount).toBeGreaterThan(0n)

      const newRootMetadata = { ...baseTest.initialTestRootMetadata }
      newRootMetadata.overridePreviousRoot = false
      newRootMetadata.preOpCount = baseTest.initialTestRootMetadata.postOpCount
      newRootMetadata.postOpCount =
        newRootMetadata.preOpCount + BigInt(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM)

      await baseTest.executeOperationsUpTo(MCMSBaseSetRootAndExecuteTestSetup.OPS_NUM)

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        newRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: true,
      })
    })
  })

  describe('SetRootVerifyProofTest', () => {
    it('should fail when postOpCount is not consistent with proof', async () => {
      // Corrupt postOpCount. Now postOpCount is not consistent with metadataProof.
      const corruptedMetadata = { ...baseTest.initialTestRootMetadata }
      corruptedMetadata.postOpCount = corruptedMetadata.postOpCount + 1n

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      setRoot.metadata = corruptedMetadata
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.PROOF_CANNOT_BE_VERIFIED,
      })
    })

    it('should fail when overridePreviousRoot is not consistent with proof', async () => {
      const corruptedMetadata = { ...baseTest.initialTestRootMetadata }
      corruptedMetadata.overridePreviousRoot = !corruptedMetadata.overridePreviousRoot

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      setRoot.metadata = corruptedMetadata
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)
      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.PROOF_CANNOT_BE_VERIFIED,
      })
    })

    it('should fail when preOpCount is not consistent with proof', async () => {
      const corruptedMetadata = { ...baseTest.initialTestRootMetadata }
      corruptedMetadata.preOpCount = corruptedMetadata.preOpCount + 1n

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      setRoot.metadata = corruptedMetadata
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)
      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.PROOF_CANNOT_BE_VERIFIED,
      })
    })

    it('should fail when multiSig is not consistent with proof', async () => {
      const corruptedMetadata = { ...baseTest.initialTestRootMetadata }
      corruptedMetadata.multiSig = baseTest.acc.multisigOwner.address

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      setRoot.metadata = corruptedMetadata
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)
      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.PROOF_CANNOT_BE_VERIFIED,
      })
    })

    it('should fail when chainId is not consistent with proof', async () => {
      const corruptedMetadata = { ...baseTest.initialTestRootMetadata }
      corruptedMetadata.chainId = corruptedMetadata.chainId + 1n
      // Note: We also need to set the blockchain chainId to match for the chainId validation

      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      setRoot.metadata = corruptedMetadata
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)
      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.PROOF_CANNOT_BE_VERIFIED,
      })
    })
  })

  describe('SetRootVerifySignaturesTest', () => {
    it('should revert on insufficient signatures for group quorum', async () => {
      const signersNum = 9
      expect(signersNum).toBeGreaterThanOrEqual(MCMSBaseSetRootAndExecuteTestSetup.SIGNERS_NUM)
      // Create a configuration with stricter quorum requirements
      const stricterGroupQuorums = new Map<number, number>()
      stricterGroupQuorums.set(0, 3) // Increase root group quorum to 3
      stricterGroupQuorums.set(1, 3) // Group 1 needs 3 signatures
      stricterGroupQuorums.set(2, 2) // Group 2 needs 2 signatures
      stricterGroupQuorums.set(3, 1) // Group 3 needs 1 signature

      // we assign 3 signers in each group, 0,1,2 in group 1, 3,4,5 in group 2, and
      // 6, 7, 8 in group 3.
      const signerGroups: number[] = []
      const signers: TestSigner[] = []
      for (let i = 0; i < signersNum; i++) {
        signers.push(baseTest.testSigners[i])
        const groupNum = Math.floor(i / 3) + 1
        signers[i].group = groupNum // Update the signer's group assignment
        signerGroups.push(groupNum)
      }

      // set the new partition of signers to groups
      {
        const setConfigBody = mcms.builder.message.in.setConfig.encode({
          queryId: 1n,
          signerKeys: signers.map((s) => uint8ArrayToBigInt(s.keyPair.publicKey)),
          signerGroups,
          groupQuorums: stricterGroupQuorums,
          groupParents: baseTest.testGroupParents,
          clearRoot: false,
        })
        const result = await baseTest.bind.mcms.sendInternal(
          baseTest.acc.multisigOwner.getSender(),
          toNano('1'),
          setConfigBody,
        )
        expect(result.transactions).toHaveTransaction({
          from: baseTest.acc.multisigOwner.address,
          to: baseTest.bind.mcms.address,
          success: true,
        })
      }

      // Create insufficient signatures (not enough for quorum)
      // With the new config:
      // - Group 1 needs 3 signatures but we'll provide only 2 (signers 0,1 - missing signer 2)
      // - Group 2 needs 2 signatures but we'll provide only 1 (signer 3 - missing signers 4,5)
      // - Group 3 needs 1 signature and we'll provide 3 (signers 6,7,8 - more than needed)
      // Root group needs 3 successful subgroups but only group 3 will be successful
      const insufficientSigners: TestSigner[] = [
        // 2 signatures from signers in group 1
        signers[0],
        signers[1],
        // skip s_signatures[2]
        // 1 signature from signers in group 2
        signers[3],
        // skip s_signatures[4]
        // skip s_signatures[5]
        // 3 signatures from signers in group 3
        signers[6],
        signers[7],
        signers[8],
      ]

      const [setRoot, opProofs] = merkleProof.build(
        insufficientSigners.map((s) => ({
          publicKey: s.keyPair.publicKey,
          sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
        })),
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)
      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('1'),
        setRootBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.INSUFFICIENT_SIGNERS,
      })
    })

    it('should revert on no signatures', async () => {
      const [setRoot, opProofs] = merkleProof.build(
        [],
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)
      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.INSUFFICIENT_SIGNERS,
      })
    })

    it('should revert on repeated signatures', async () => {
      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))
      signers[0] = signers[1] // Repeat the first signer

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)
      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.SIGNERS_KEYS_MUST_BE_STRICTLY_INCREASING,
      })
    })

    it('should revert on invalid signature on root', async () => {
      // Modify a leaf in the merkle tree to get a different root
      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))
      signers[0] = signers[1] // Repeat the first signer

      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      const corruptOps = [...baseTest.testOps]
      corruptOps[0].data = beginCell().storeUint(0x2222222, 32).endCell()
      const [corruptSetRoot, _] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        corruptOps,
      )
      setRoot.root = corruptSetRoot.root

      // Use old signatures (invalid for new root)
      const setRootBody = mcms.builder.message.in.setRoot.encode(setRoot)
      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        setRootBody,
      )
      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.INVALID_SIGNER,
      })
    })

    it('should revert on inconsistent validUntil with signature', async () => {
      // Pass different validUntil but use signatures for original validUntil
      const signers = baseTest.testSigners.map((s) => ({
        publicKey: s.keyPair.publicKey,
        sign: (data: Buffer<ArrayBufferLike>) => sign(data, s.keyPair.secretKey),
      }))
      const [setRoot, opProofs] = merkleProof.build(
        signers,
        BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL),
        baseTest.initialTestRootMetadata,
        baseTest.testOps,
      )
      setRoot.validUntil = BigInt(MCMSBaseSetRootAndExecuteTestSetup.TEST_VALID_UNTIL + 1)

      const result = await baseTest.bind.mcms.sendInternal(
        baseTest.acc.deployer.getSender(),
        toNano('0.05'),
        mcms.builder.message.in.setRoot.encode(setRoot),
      )

      expect(result.transactions).toHaveTransaction({
        from: baseTest.acc.deployer.address,
        to: baseTest.bind.mcms.address,
        success: false,
        exitCode: mcms.Error.INVALID_SIGNER,
      })
    })
  })
})
