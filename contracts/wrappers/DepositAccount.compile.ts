import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/accounts/deposit/contract.tolk',
  withStackComments: true,
}
