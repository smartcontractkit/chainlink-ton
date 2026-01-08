import { OpMapFunc } from '@ton/sandbox/dist/utils/printTransactionFees'
import * as fq from '../../../../wrappers/ccip/FeeQuoter'
import * as onRamp from '../../../../wrappers/ccip/OnRamp'
import * as rt from '../../../../wrappers/ccip/Router'
import * as sx from '../../../../wrappers/ccip/CCIPSendExecutor'
import * as rx from '../../../../wrappers/ccip/Receiver'
import * as deployable from '../../../../wrappers/libraries/Deployable'
import * as offRamp from '../../../../wrappers/ccip/OffRamp'
import * as mr from '../../../../wrappers/ccip/MerkleRoot'

export function opMapFunc(): OpMapFunc {
  const opcodeMap = new Map<number, string>()
  Object.entries(fq.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `FeeQuoter::In::${name}`)
  })
  Object.entries(fq.opcodes.out).forEach(([name, code]) => {
    opcodeMap.set(code, `FeeQuoter::Out::${name}`)
  })
  Object.entries(onRamp.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `OnRamp::In::${name}`)
  })
  Object.entries(onRamp.opcodes.out).forEach(([name, code]) => {
    opcodeMap.set(code, `OnRamp::Out::${name}`)
  })
  Object.entries(rt.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `Router::In::${name}`)
  })
  Object.entries(rt.opcodes.out).forEach(([name, code]) => {
    opcodeMap.set(code, `Router::Out::${name}`)
  })
  Object.entries(sx.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `SendExecutor::In::${name}`)
  })
  Object.entries(deployable.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `Deployable::${name}`)
  })
  Object.entries(offRamp.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `OffRamp::In::${name}`)
  })
  Object.entries(rx.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `ReceiveExecutor::In::${name}`)
  })
  Object.entries(mr.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `MerkleRoot::${name}`)
  })
  const mapFunc: OpMapFunc = (op: number) => {
    return opcodeMap.get(op)
  }
  return mapFunc
}
