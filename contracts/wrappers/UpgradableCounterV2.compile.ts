import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/upgrades/upgradable_counter_v2.tact',
  options: {
    debug: true,
  },
}
