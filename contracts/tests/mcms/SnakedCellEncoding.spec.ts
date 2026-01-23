import '@ton/test-utils'

import { Address, beginCell } from '@ton/core'

import { asSnakedCell } from '../../src/utils'

import { rbactl } from '../../wrappers/mcms'

/**
 * Cross-implementation compatibility tests for SnakedCell<Timelock_Call> encoding.
 *
 * These tests verify that TypeScript and Go produce identical cell encodings.
 * Both test files use the same expected hash values.
 *
 * ## How to update expected hashes:
 *
 * 1. Update encoding logic in either TypeScript or Go
 * 2. Run this test to get the new hash values
 * 3. Update EXPECTED_*_HASH constants in both files:
 *    - contracts/tests/mcms/SnakedCellEncoding.spec.ts (this file)
 *    - pkg/bindings/mcms/timelock/types_test.go
 */
describe('MCMS - SnakedCell<Timelock_Call> Cross-Implementation Encoding', () => {
  // Fixed test addresses matching Go tests
  const TEST_ADDRESS_1 = Address.parse('EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2')
  const TEST_ADDRESS_2 = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c')

  // Expected hashes - must match pkg/bindings/mcms/timelock/types_test.go
  const EXPECTED_CALL_HASH = '9d76debffe8ed5a1aed0afc679a2184605e716d79eb0a620a26c816ffc4db69e'
  const EXPECTED_SNAKED_CELL_HASH =
    'bdd17632e37830a1717d09be997fe13368b668f781406e2eaa3299e13da9d294'
  const EXPECTED_OPERATION_BATCH_HASH =
    '9425b1429118466b66ca668b982b36b99ca5a17cfe334002d1cd0728e4009320'

  it('should match Go encoding for single Call', () => {
    const call: rbactl.Call = {
      target: TEST_ADDRESS_1,
      value: 1000000000n, // 1 TON
      data: beginCell().storeUint(0x12345678, 32).endCell(),
    }

    const encodedCall = rbactl.builder.data.call.encode(call).asCell()
    const hash = encodedCall.hash().toString('hex')
    // console.log('Hash:',hash)
    expect(hash).toEqual(EXPECTED_CALL_HASH)
  })

  it('should match Go encoding for SnakedCell<Call>', () => {
    const calls: rbactl.Call[] = [
      {
        target: TEST_ADDRESS_1,
        value: 100000000n, // 0.1 TON
        data: beginCell().storeUint(0x11111111, 32).storeUint(1n, 64).endCell(),
      },
      {
        target: TEST_ADDRESS_2,
        value: 200000000n, // 0.2 TON
        data: beginCell().storeUint(0x22222222, 32).storeUint(2n, 64).endCell(),
      },
    ]

    const snakedCalls = asSnakedCell<rbactl.Call>(calls, (c) => rbactl.builder.data.call.encode(c))
    const hash = snakedCalls.hash().toString('hex')
    // console.log('Hash:',hash)
    expect(hash).toEqual(EXPECTED_SNAKED_CELL_HASH)
  })

  it('should match Go encoding for OperationBatch', () => {
    const calls: rbactl.Call[] = [
      {
        target: TEST_ADDRESS_1,
        value: 100000000n,
        data: beginCell().storeUint(0x11111111, 32).storeUint(1n, 64).endCell(),
      },
      {
        target: TEST_ADDRESS_2,
        value: 200000000n,
        data: beginCell().storeUint(0x22222222, 32).storeUint(2n, 64).endCell(),
      },
    ]

    const snakedCalls = asSnakedCell<rbactl.Call>(calls, (c) => rbactl.builder.data.call.encode(c))

    const opBatch: rbactl.OperationBatch = {
      calls: snakedCalls,
      predecessor: 0n,
      salt: 123456789n,
    }

    const encodedBatch = rbactl.builder.data.operationBatch.encode(opBatch).asCell()
    const hash = encodedBatch.hash().toString('hex')
    // console.log('Hash:',hash)
    expect(hash).toEqual(EXPECTED_OPERATION_BATCH_HASH)
  })
})
