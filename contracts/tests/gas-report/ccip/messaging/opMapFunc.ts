import { OpMapFunc } from '@ton/sandbox/dist/utils/printTransactionFees'
import * as fq from '../../../../wrappers/gen/ccip/FeeQuoter'
import * as onRamp from '../../../../wrappers/ccip/OnRamp'
import * as rt from '../../../../wrappers/ccip/Router'
import * as sx from '../../../../wrappers/ccip/CCIPSendExecutor'
import * as receiver from '../../../../wrappers/libraries/Receiver'
import * as testReceiver from '../../../../wrappers/examples/Receiver'
import * as deployable from '../../../../wrappers/libraries/Deployable'
import * as offRamp from '../../../../wrappers/gen/ccip/OffRamp'
import * as mr from '../../../../wrappers/ccip/MerkleRoot'

export function opMapFunc(): OpMapFunc {
  const opcodeMap = new Map<number, string>()
  const feeQuoterOpcodes: Array<[string, number]> = [
    ['AddPriceUpdater', fq.FeeQuoter_AddPriceUpdater.PREFIX],
    ['RemovePriceUpdater', fq.FeeQuoter_RemovePriceUpdater.PREFIX],
    ['UpdatePrices', fq.FeeQuoter_UpdatePrices.PREFIX],
    ['UpdateFeeTokens', fq.FeeQuoter_UpdateFeeTokens.PREFIX],
    ['UpdateTokenTransferFeeConfigs', fq.FeeQuoter_UpdateTokenTransferFeeConfigs.PREFIX],
    ['UpdateDestChainConfigs', fq.FeeQuoter_UpdateDestChainConfigs.PREFIX],
    ['GetValidatedFee', fq.FeeQuoter_GetValidatedFee.PREFIX],
    ['MessageValidated', fq.FeeQuoter_MessageValidated.PREFIX],
    ['MessageValidationFailed', fq.FeeQuoter_MessageValidationFailed.PREFIX],
  ]
  feeQuoterOpcodes.forEach(([name, code]) => opcodeMap.set(code, `FeeQuoter::${name}`))
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
  opcodeMap.set(offRamp.OffRamp_Commit.PREFIX, 'OffRamp::In::commit')
  opcodeMap.set(offRamp.OffRamp_Execute.PREFIX, 'OffRamp::In::execute')
  opcodeMap.set(
    offRamp.OffRamp_UpdateSourceChainConfigs.PREFIX,
    'OffRamp::In::updateSourceChainConfigs',
  )
  opcodeMap.set(offRamp.OCR3Base_SetOCR3Config.PREFIX, 'OffRamp::In::setOCR3Config')
  Object.entries(testReceiver.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `TestReceiver::In::${name}`)
  })
  Object.entries(receiver.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `Receiver::In::${name}`)
  })
  Object.entries(mr.opcodes.in).forEach(([name, code]) => {
    opcodeMap.set(code, `MerkleRoot::${name}`)
  })
  const mapFunc: OpMapFunc = (op: number) => {
    return opcodeMap.get(op)
  }
  return mapFunc
}
