import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target:
    'contracts/examples/in_place_upgrade_same_memory_layout/upgradable_simple_counter_add.tact',
  options: {
    debug: true,
  },
}
