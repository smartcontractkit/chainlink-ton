import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/test/examples/counter_legacy.tact',
  options: {
    debug: true,
  },
}
