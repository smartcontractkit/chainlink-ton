import * as c from '@ton/core';

import { Router } from './ccip/Router';
import { OffRamp } from './ccip/OffRamp';
import { OnRamp } from './ccip/OnRamp';
import { ReceiveExecutor } from './ccip/ReceiveExecutor';
import { CCIPSendExecutor } from './ccip/CCIPSendExecutor';

import { TokenPool } from './ccip/pools/TokenPool'
import { BurnMintTokenPool } from './ccip/pools/BurnMintTokenPool'
import { LockReleaseTokenPool } from './ccip/pools/LockReleaseTokenPool'
import { LockReleaseLockboxTokenPool } from './ccip/pools/LockReleaseLockboxTokenPool'

import { MockTokenPool } from './ccip/MockTokenPool';

import { TestMsgHasher } from './test/TestMsgHasher'

import * as CrossChainAddressCodec from '../ccip/common/CrossChainAddressCodec'

export function setupGenBindings() {
    // Setup custom pack/unpack for CrossChainAddress
    TokenPool.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    BurnMintTokenPool.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    LockReleaseTokenPool.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    Router.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    CCIPSendExecutor.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    ReceiveExecutor.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    OffRamp.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    OnRamp.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    MockTokenPool.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    LockReleaseLockboxTokenPool.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    TestMsgHasher.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )
}

export interface CellCodec<T> {
  fromSlice(s: c.Slice): T
  store(self: T, b: c.Builder): void
}