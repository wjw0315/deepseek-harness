import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** The editable state of the community-market view store. */
export interface MarketViewState {
  open: boolean
}

type MarketViewActions = {
  open: (draft: MarketViewState) => void
  close: (draft: MarketViewState) => void
}

/** Creates the engine store backing the community-market launcher and overlay open/close state.
 * @returns A handle to the created market view store. */
export function createMarketViewStore(): EngineStoreHandle<MarketViewState, MarketViewActions> {
  return defineStore({
    init: (): MarketViewState => ({ open: false }),
    actions: {
      open: (draft) => { draft.open = true },
      close: (draft) => { draft.open = false },
    },
  })
}
