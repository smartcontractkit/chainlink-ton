import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/upgradable_counter/upgradable_counter_v1.tact',
  options: {
    debug: true,
  },
}
