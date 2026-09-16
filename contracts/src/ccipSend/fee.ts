import { Address } from '@ton/core'
import * as rt from '../../wrappers/gen/ccip/Router'
import * as onr from '../../wrappers/gen/ccip/OnRamp'
import * as fq from '../../wrappers/gen/ccip/FeeQuoter'
import { Blockchain } from '@ton/sandbox'

// Gets the validated fee for a CCIPSend message with off-chain getters
export async function getValidatedFee(
  blockchain: Blockchain,
  router: Address,
  msg: rt.Router_CCIPSend,
): Promise<bigint> {
  const routerContract = blockchain.openContract(rt.Router.fromAddress(router))
  const orAddress = await routerContract.getOnRamp(msg.destChainSelector)
  const onRampContract = blockchain.openContract(onr.OnRamp.fromAddress(orAddress))
  const feeQuoterAddress = await onRampContract.getFeeQuoter(msg.destChainSelector)
  const feeQuoterContract = blockchain.openContract(fq.FeeQuoter.fromAddress(feeQuoterAddress))
  const fee = await feeQuoterContract.getValidatedFeeCell(msg)
  return fee
}
