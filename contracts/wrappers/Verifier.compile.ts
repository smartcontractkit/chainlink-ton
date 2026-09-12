import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/data-streams/verifier/contract.tolk',
  withStackComments: true,
}
