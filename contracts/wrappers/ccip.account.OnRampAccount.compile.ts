import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/accounts/on_ramp_account/contract.tolk',
  withStackComments: true,
}
