import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/merkle_root/contract.tolk',
  withStackComments: true,
}
