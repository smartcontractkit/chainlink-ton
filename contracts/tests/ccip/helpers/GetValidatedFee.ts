import { Cell, Sender, Slice, toNano } from '@ton/core'
import { SandboxContract } from '@ton/sandbox'
import * as rt from '../../../wrappers/ccip/Router'
import * as or from '../../../wrappers/ccip/OnRamp'
import * as sx from '../../../wrappers/ccip/CCIPSendExecutor'
import * as fq from '../../../wrappers/ccip/FeeQuoter'
import { dump } from '../../utils/prettyPrint'

// Helper function to send a GetValidatedFee request to router and parse the response
export async function sendGetValidatedFee(
  sender: Sender,
  router: SandboxContract<rt.Router>,
  msg: rt.CCIPSend,
  context: Slice,
): Promise<bigint> {
  const result = await router.sendGetValidatedFee(sender, toNano('1'), msg, context)

  console.log('Trace:\n', (await dump(result.transactions)).join('\n'))
  // request
  expect(result.transactions).toHaveTransaction({
    from: sender.address,
    to: router.address,
    success: true,
  })
  // response
  expect(result.transactions).toHaveTransaction({
    from: router.address,
    to: sender.address,
    success: true,
  })

  const tx = result.transactions.find(
    (tx) => tx.inMessage?.info.type === 'internal' && tx.inMessage.info.src.equals(router.address),
  )

  if (!tx || tx.inMessage === undefined || tx.inMessage?.info.type !== 'internal') {
    throw new Error('Failed to find response transaction')
  }
  const resp = tx.inMessage

  const body = resp.body.beginParse()
  expect(body.preloadUint(32)).toBe(sx.Opcodes.messageValidated)
  const messageValidated = fq.builder.message.out.messageValidated.load(resp.body.beginParse())
  return messageValidated.fee
}
