import { useState, useEffect, useCallback } from 'react';
import { fmtUSD, fmtTok, mapProviders, visibleProviders } from './api.js';
import { ProviderDetail, ProviderCard, ProviderRow } from './components.jsx';

const POLL_MS = 60000;

function useStickyState(key, def) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s === null ? def : JSON.parse(s); } catch (e) { return def; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }, [key, v]);
  return [v, setV];
}

function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [query]);
  return matches;
}

function useSummary() {
  const [state, setState] = useState({ providers: [], loading: true, error: null, updatedAt: null });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch('/api/summary');
      if (!res.ok) throw new Error('request failed (' + res.status + ')');
      const env = await res.json();
      setState({ providers: mapProviders(env, Date.now()), loading: false, error: null, updatedAt: Date.now() });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);
  return { ...state, reload: load };
}

function Summary({ providers }) {
  const withCost = providers.filter((p) => p.cost.last30);
  const today = providers.reduce((a, p) => a + (p.cost.today?.usd || 0), 0);
  const m30 = withCost.reduce((a, p) => a + p.cost.last30.usd, 0);
  const tok = withCost.reduce((a, p) => a + p.cost.last30.tokens, 0);
  const alerts = providers.filter((p) => p.status !== 'ok').length;
  const Item = ({ k, v, accent }) => (
    <div className="sum__item">
      <div className="sum__k mono faint">{k}</div>
      <div className="sum__v num" style={accent ? { color: accent } : null}>{v}</div>
    </div>
  );
  return (
    <div className="sum">
      <Item k="SPEND · 30D" v={fmtUSD(m30, 0)} />
      <Item k="SPEND · TODAY" v={fmtUSD(today, 2)} />
      <Item k="TOKENS · 30D" v={fmtTok(tok)} />
      <Item k="NEAR LIMIT" v={alerts} accent={alerts ? 'var(--bad)' : null} />
    </div>
  );
}

function Header({ theme, setTheme, onRefresh, loading, count }) {
  return (
    <header className="hdr">
      <div className="hdr__brand">
        <span className="logo">◢◤</span>
        <span className="brand__name">TokenBurn</span>
        <span className="brand__tag mono faint">{count} {count === 1 ? 'provider' : 'providers'}</span>
      </div>
      <div className="hdr__right">
        <button className={'iconbtn' + (loading ? ' iconbtn--spin' : '')} onClick={onRefresh} aria-label="Refresh" title="Refresh">↻</button>
        <button className="iconbtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme" title="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
}

function ConsoleView({ providers, sel, setSel }) {
  const p = providers.find((x) => x.id === sel) || providers[0];
  if (!p) return null;
  return (
    <div className="console">
      <aside className="side">
        <div className="side__label mono faint">PROVIDERS</div>
        <div className="side__list">
          {providers.map((x) => <ProviderRow key={x.id} p={x} active={x.id === p.id} onSelect={setSel} />)}
        </div>
      </aside>
      <main className="console__main">
        <div className="panel"><ProviderDetail p={p} /></div>
      </main>
    </div>
  );
}

function GridView({ providers }) {
  const [sel, setSel] = useState(null);
  const p = providers.find((x) => x.id === sel);
  return (
    <div className="gridwrap">
      <div className="pgrid">
        {providers.map((x) => <ProviderCard key={x.id} p={x} active={sel === x.id} onOpen={setSel} />)}
      </div>
      {p && (
        <div className="drawer-scrim" onClick={() => setSel(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <button className="drawer__close" onClick={() => setSel(null)} aria-label="Close">✕</button>
            <ProviderDetail p={p} />
          </div>
        </div>
      )}
    </div>
  );
}

function SetupHelp() {
  return (
    <div className="setup">
      <div className="setup__title">No providers configured</div>
      <p className="setup__body">
        TokenBurn shows usage for providers the API can reach. To add one, either:
      </p>
      <ul className="setup__list mono">
        <li>Set a provider API key in the API's <span className="num">.env</span> — e.g. <span className="num">GEMINI_API_KEY</span> or <span className="num">ZAI_API_KEY</span>.</li>
        <li>Use a subscription plan: log in on the host (<span className="num">claude setup-token</span>, <span className="num">codex</span> login) and mount <span className="num">~/.claude</span> / <span className="num">~/.codex</span> into the API container.</li>
      </ul>
      <p className="setup__body faint">See the project README for the full setup.</p>
    </div>
  );
}

export function App() {
  const [theme, setTheme] = useStickyState('tb.theme', 'dark');
  const [sel, setSel] = useStickyState('tb.sel', 'claude');
  const { providers, loading, error, updatedAt, reload } = useSummary();
  // Mobile gets the grid; desktop gets the console. No manual layout switch.
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  // Hide providers that errored (e.g. unconfigured / missing API key).
  const visible = visibleProviders(providers);
  const initialLoading = loading && providers.length === 0;

  return (
    <div className="app">
      <Header theme={theme} setTheme={setTheme} onRefresh={reload} loading={loading} count={visible.length} />

      {error && <div className="statebar statebar--error">⚠ Couldn't load usage data: {error}</div>}
      {initialLoading && !error && <div className="statebar">Loading usage…</div>}

      {!error && !initialLoading && visible.length === 0 && <SetupHelp />}

      {visible.length > 0 && (
        <>
          <Summary providers={visible} />
          <div className="body">
            {isMobile
              ? <GridView providers={visible} />
              : <ConsoleView providers={visible} sel={sel} setSel={setSel} />}
          </div>
          {updatedAt && <div className="lastupd mono" style={{ marginTop: 16 }}>Updated {new Date(updatedAt).toLocaleTimeString()}</div>}
        </>
      )}
    </div>
  );
}
