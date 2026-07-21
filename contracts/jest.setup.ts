import { expect } from '@jest/globals'
import { tonEquals } from './src/utils'
import { setupGenBindings } from './wrappers/gen'

expect.addEqualityTesters([tonEquals])
setupGenBindings()
