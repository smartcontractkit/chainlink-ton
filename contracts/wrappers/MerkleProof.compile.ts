import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/merkle_multi_proof_example.tact',
  options: {
    debug: true,
  },
}
