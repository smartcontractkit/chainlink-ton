import { Builder, Slice, beginCell, toNano } from '@ton/core'
import { Router } from './ccip/Router';
import { OffRamp } from './ccip/OffRamp';
import { TokenPool } from './ccip/pools/TokenPool'
import { BurnMintTokenPool } from './ccip/pools/BurnMintTokenPool'
import { LockReleaseTokenPool } from './ccip/pools/LockReleaseTokenPool'
import { LockReleaseLockboxTokenPool } from './ccip/pools/LockReleaseLockboxTokenPool'
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

    OffRamp.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )

    LockReleaseLockboxTokenPool.registerCustomPackUnpack(
      'CrossChainAddress',
      CrossChainAddressCodec.packToBuilder,
      CrossChainAddressCodec.unpackFromSlice,
    )
}
