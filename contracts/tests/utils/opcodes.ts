import * as rt from '../../wrappers/ccip/Router'
import * as onr from '../../wrappers/ccip/OnRamp'
import * as fq from '../../wrappers/ccip/FeeQuoter'
import * as sx from '../../wrappers/ccip/CCIPSendExecutor'
// import * as rx from '../../wrappers/ccip/CCIPReceiveExecutor'
import * as offr from '../../wrappers/ccip/OffRamp'

// Create a comprehensive opcode mapping
const createOpcodeMapping = () => {
  const mapping: Record<number, string> = {}

  for (const [ops, name] of [
    [rt.Opcodes, 'Router.in'],
    [rt.OutgoingOpcodes, 'Router.out'],
    [onr.Opcodes, 'OnRamp.in'],
    [fq.Opcodes, 'FeeQuoter.in'],
    [sx.Opcodes, 'SendExecutor.in'],
    // [rx.Opcodes, 'ReceiveExecutor.in'],
    [offr.Opcodes, 'OffRamp.in'],
  ]) {
    for (const [key, value] of Object.entries(ops)) {
      mapping[value as number] = `${name}.${key}`
    }
  }

  return mapping
}

export const OPCODE_MAPPING = createOpcodeMapping()

// Useful to use with printTransactionFees from @ton/sandbox
export const mapOpcode = (op: number): string | undefined => {
  return OPCODE_MAPPING[op]
}
