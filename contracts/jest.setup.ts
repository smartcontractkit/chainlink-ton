import { expect } from '@jest/globals'
import { tonEquals } from './src/utils'

expect.addEqualityTesters([tonEquals])
