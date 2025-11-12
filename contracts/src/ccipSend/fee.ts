import { Address, ContractProvider } from '@ton/core'
import * as rt from '../../wrappers/ccip/Router'
import * as onr from '../../wrappers/ccip/OnRamp'
import * as fq from '../../wrappers/ccip/FeeQuoter'
import { Blockchain } from '@ton/sandbox'

// Gets the validated fee for a CCIPSend message with off-chain getters
export async function getValidatedFee(
  blockchain: Blockchain,
  router: Address,
  msg: rt.CCIPSend,
): Promise<bigint> {
  const routerContract = blockchain.openContract(rt.Router.createFromAddress(router))
  const orAddress = await routerContract.getOnRamp(msg.destChainSelector)
  const onRampContract = blockchain.openContract(onr.OnRamp.createFromAddress(orAddress))
  const feeQuoterAddress = await onRampContract.getFeeQuoter(msg.destChainSelector)
  const feeQuoterContract = blockchain.openContract(
    fq.FeeQuoter.createFromAddress(feeQuoterAddress),
  )
  const fee = await feeQuoterContract.getValidatedFee(msg)
  return fee
}
