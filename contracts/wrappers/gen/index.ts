import { Builder, Slice, beginCell, toNano } from '@ton/core'
import { Router } from './ccip/Router';
import { TokenPool } from './ccip/pools/TokenPool'
import { BurnMintTokenPool } from './ccip/pools/BurnMintTokenPool'
import { LockReleaseTokenPool } from './ccip/pools/LockReleaseTokenPool'
import { LockReleaseLockboxTokenPool } from './ccip/pools/LockReleaseLockboxTokenPool'

import * as rtOld from '../ccip/Router'

function CrossChainAddress__packToBuilder(self: Slice, b: Builder): void {
    const src = self.clone()
    const buffer = src.loadBuffer(src.remainingBits / 8)
    b.storeBuilder(rtOld.builder.data.crossChainAddress.encode(buffer))
}
function CrossChainAddress__unpackFromSlice(s: Slice): Slice {
    const buff = rtOld.builder.data.crossChainAddress.load(s)
    return beginCell().storeBuffer(buff).asSlice()
}

export function setupGenBindings() {
    // Setup custom pack/unpack for CrossChainAddress
    TokenPool.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddress__packToBuilder,
      CrossChainAddress__unpackFromSlice,
    )

    BurnMintTokenPool.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddress__packToBuilder,
      CrossChainAddress__unpackFromSlice,
    )

    LockReleaseTokenPool.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddress__packToBuilder,
      CrossChainAddress__unpackFromSlice,
    )

    Router.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddress__packToBuilder,
      CrossChainAddress__unpackFromSlice,
    )

    LockReleaseLockboxTokenPool.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddress__packToBuilder,
      CrossChainAddress__unpackFromSlice,
    )
}
