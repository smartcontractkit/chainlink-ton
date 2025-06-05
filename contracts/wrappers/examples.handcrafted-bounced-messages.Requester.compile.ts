import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/handcrafted-bounced-messages/requester.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
