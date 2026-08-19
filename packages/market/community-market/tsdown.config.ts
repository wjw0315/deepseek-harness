import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-community-market',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
