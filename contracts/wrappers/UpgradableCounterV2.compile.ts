import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/upgradable_counter/upgradable_counter_v2.tact',
  options: {
    debug: true,
  },
}
