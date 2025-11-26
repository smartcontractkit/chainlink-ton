import { OpMapFunc } from '@ton/sandbox/dist/utils/printTransactionFees'
import * as fq from '../../../../wrappers/ccip/FeeQuoter'
import * as or from '../../../../wrappers/ccip/OnRamp'
import * as rt from '../../../../wrappers/ccip/Router'
import * as sx from '../../../../wrappers/ccip/CCIPSendExecutor'
import * as deployable from '../../../../wrappers/libraries/Deployable'

export function opMapFunc(): OpMapFunc {
  const opcodeMap = new Map<number, string>()
  Object.entries(fq.Opcodes).forEach(([name, code]) => {
    opcodeMap.set(code, `FeeQuoter::In::${name}`)
  })
  Object.entries(fq.OutgoingOpcodes).forEach(([name, code]) => {
    opcodeMap.set(code, `FeeQuoter::Out::${name}`)
  })
  Object.entries(or.Opcodes).forEach(([name, code]) => {
    opcodeMap.set(code, `OnRamp::In::${name}`)
  })
  Object.entries(or.OutgoingOpcodes).forEach(([name, code]) => {
    opcodeMap.set(code, `OnRamp::Out::${name}`)
  })
  Object.entries(rt.Opcodes).forEach(([name, code]) => {
    opcodeMap.set(code, `Router::In::${name}`)
  })
  Object.entries(rt.OutOpcodes).forEach(([name, code]) => {
    opcodeMap.set(code, `Router::Out::${name}`)
  })
  Object.entries(sx.Opcodes).forEach(([name, code]) => {
    opcodeMap.set(code, `CCIPSendExecutor::In::${name}`)
  })
  Object.entries(deployable.Opcodes).forEach(([name, code]) => {
    opcodeMap.set(code, `Deployable::${name}`)
  })
  const mapFunc: OpMapFunc = (op: number) => {
    return opcodeMap.get(op)
  }
  return mapFunc
}
