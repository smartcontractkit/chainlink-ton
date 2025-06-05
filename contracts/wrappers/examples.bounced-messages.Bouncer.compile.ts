import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/bounced-messages/bouncer.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
