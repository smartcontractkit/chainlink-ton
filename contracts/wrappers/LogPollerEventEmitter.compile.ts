import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/examples/logpoller/event_emitter.tolk',
  withStackComments: true,
}
