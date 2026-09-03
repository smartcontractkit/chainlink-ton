import * as c from '@ton/core';

import { Router } from './ccip/Router';
import { OffRamp } from './ccip/OffRamp';
import { OnRamp } from './ccip/OnRamp';
import { FeeQuoter } from './ccip/FeeQuoter';
import { ReceiveExecutor } from './ccip/ReceiveExecutor';
import { CCIPSendExecutor } from './ccip/CCIPSendExecutor';
import { MerkleRoot } from './ccip/MerkleRoot';

import { TokenPool } from './ccip/pools/TokenPool'
import { BurnMintTokenPool } from './ccip/pools/BurnMintTokenPool'
import { LockReleaseTokenPool } from './ccip/pools/LockReleaseTokenPool'
import { LockReleaseLockboxTokenPool } from './ccip/pools/LockReleaseLockboxTokenPool'

import { TestMsgHasher } from './test/TestMsgHasher'

import * as CrossChainAddressCodec from '../ccip/common/CrossChainAddressCodec'

// Setup custom pack/unpack for CrossChainAddress
export function setupGenBindings() {
    const CCIPContracts = [
      CCIPSendExecutor,
      ReceiveExecutor,
      OffRamp,
      OnRamp,
      FeeQuoter,
      Router,
      MerkleRoot,
    ]

    const TokenPools = [
      TokenPool,
      BurnMintTokenPool,
      LockReleaseTokenPool,
      LockReleaseLockboxTokenPool,
    ]

    const TestContracts = [
      TestMsgHasher,
    ]

    for (const wrapper of [
      ...CCIPContracts,
      ...TokenPools,
      ...TestContracts,
    ]) {
        wrapper.registerCustomPackUnpack(
        'CrossChainAddress',
        CrossChainAddressCodec.packToBuilder,
        CrossChainAddressCodec.unpackFromSlice,
      )
    }
}

export interface CellCodec<T> {
  fromSlice(s: c.Slice): T
  store(self: T, b: c.Builder): void
}