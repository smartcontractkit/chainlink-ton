import { OpMapFunc } from '@ton/sandbox/dist/utils/printTransactionFees'
import * as router from '../../../wrappers/gen/ccip/Router'
import * as onRamp from '../../../wrappers/gen/ccip/OnRamp'
import * as offRamp from '../../../wrappers/gen/ccip/OffRamp'
import * as feeQuoter from '../../../wrappers/gen/ccip/FeeQuoter'
import * as sendExecutor from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import * as receiveExecutor from '../../../wrappers/gen/ccip/ReceiveExecutor'
import * as merkleRoot from '../../../wrappers/gen/ccip/MerkleRoot'
import * as depositAccount from '../../../wrappers/gen/ccip/DepositAccount'
import * as testReceiver from '../../../wrappers/gen/ccip/TestReceiver'
import * as tokenAdminRegistry from '../../../wrappers/gen/ccip/TokenAdminRegistry'
import * as tokenAdminRegistryEntry from '../../../wrappers/gen/ccip/TokenAdminRegistryEntry'
import * as tokenPool from '../../../wrappers/gen/ccip/pools/TokenPool'
import * as burnMintTokenPool from '../../../wrappers/gen/ccip/pools/BurnMintTokenPool'
import * as lockReleaseTokenPool from '../../../wrappers/gen/ccip/pools/LockReleaseLockboxTokenPool'
import * as jettonLockBox from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import * as cctMinter from '../../../wrappers/gen/ccip/cct/JettonMinter'
import * as cctWallet from '../../../wrappers/gen/ccip/cct/JettonWallet'
import * as deployable from '../../../wrappers/libraries/Deployable'
import { JettonOpcodes } from '../../../wrappers/jetton/constants'

// Opcode -> message name, collected from every generated message wrapper (`PREFIX`).
const names = new Map<number, string>()

for (const mod of [
  router,
  onRamp,
  offRamp,
  feeQuoter,
  sendExecutor,
  receiveExecutor,
  merkleRoot,
  depositAccount,
  testReceiver,
  tokenAdminRegistry,
  tokenAdminRegistryEntry,
  tokenPool,
  burnMintTokenPool,
  lockReleaseTokenPool,
  jettonLockBox,
  cctMinter,
  cctWallet,
]) {
  for (const [name, value] of Object.entries(mod)) {
    const prefix = (value as { PREFIX?: unknown } | null)?.PREFIX
    if (typeof prefix === 'number' && prefix !== 0 && !names.has(prefix)) {
      names.set(prefix, name)
    }
  }
}
for (const [name, code] of Object.entries(deployable.opcodes.in)) {
  names.set(code, `Deployable.${name}`)
}
for (const [name, code] of Object.entries(JettonOpcodes)) {
  if (!names.has(code)) names.set(code, `Jetton.${name}`)
}

export function opName(op: number): string {
  return names.get(op) ?? `0x${op.toString(16).padStart(8, '0')}`
}

export const opMapFunc: OpMapFunc = (op: number) => names.get(op)
