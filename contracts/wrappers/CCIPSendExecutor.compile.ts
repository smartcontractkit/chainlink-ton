import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/ccipsend_executor/contract.tolk',
  withStackComments: true,
}
