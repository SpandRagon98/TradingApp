import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

// Loads the symbol/interval/strategy catalogues once for selectors.
export function useMeta() {
  const [meta, setMeta] = useState({ symbols: [], intervals: [], strategies: [] });
  useEffect(() => {
    Promise.all([api('/market/symbols'), api('/strategies')]).then(([s, st]) => {
      setMeta({
        symbols: s.ok ? s.symbols : [],
        intervals: s.ok ? s.intervals : ['5m'],
        strategies: st.ok ? st.strategies.map((x) => x.name) : [],
      });
    });
  }, []);
  return meta;
}
