import { fmtUSD, fmtTok, pct } from './api.js';

/* ---------------- atoms ---------------- */
export function Bar({ value, accent, tone, height = 8 }) {
  const v = Math.max(0, Math.min(100, value || 0));
  let color = accent;
  if (tone === 'crit' || v >= 95) color = 'var(--bad)';
  else if (tone === 'warn' || v >= 80) color = 'var(--warn)';
  return (
    <div className="bar" style={{ height }}>
      <div className="bar__fill" style={{ width: v + '%', background: color }} />
    </div>
  );
}

export function MiniBars({ data, accent, height = 36, fmt = fmtUSD }) {
  const max = Math.max(...data, 0.0001);
  return (
    <div className="minibars" style={{ height }}>
      {data.map((d, i) => (
        <div
          key={i}
          className="minibars__col"
          style={{ height: Math.max(2, (d / max) * 100) + '%', background: accent, opacity: i === data.length - 1 ? 1 : 0.34 }}
          title={fmt(d)}
        />
      ))}
    </div>
  );
}

export function PaceTag({ pace }) {
  const sign = pace.delta > 0 ? '+' : '';
  return <span className={'pace pace--' + pace.state}>{pace.label} ({sign}{pace.delta}%)</span>;
}

export function StatusDot({ status }) {
  return <span className={'sdot sdot--' + status} />;
}

export function MeterBlock({ label, value, sub, accent, tone, foot }) {
  return (
    <div className="meter">
      <div className="meter__top">
        <span className="meter__label">{label}</span>
        <span className="meter__pct mono">{pct(value)}</span>
      </div>
      <Bar value={value} accent={accent} tone={tone} />
      <div className="meter__foot">
        <span className="mono dim">{sub}</span>
        {foot && <span className="mono faint">{foot}</span>}
      </div>
    </div>
  );
}

/* ---------------- provider detail ---------------- */
export function ProviderDetail({ p, dense }) {
  if (p.error) {
    return (
      <div className={'detail' + (dense ? ' detail--dense' : '')} style={{ '--pa': p.accent }}>
        {!dense && (
          <div className="detail__head">
            <div className="detail__id">
              <span className="glyph" style={{ color: p.accent }}>{p.glyph}</span>
              <div><div className="detail__name">{p.name}</div></div>
            </div>
          </div>
        )}
        <div className="perr">⚠ <span className="mono">{p.error}</span></div>
      </div>
    );
  }

  const meters = [];
  if (p.session) meters.push(
    <MeterBlock key="s" label="Session" value={p.session.pct} accent={p.accent}
      sub={p.session.pct + '% used'} foot={p.session.resetsIn ? 'Resets in ' + p.session.resetsIn : null} />
  );
  if (p.weekly) meters.push(
    <MeterBlock key="w" label="Weekly" value={p.weekly.pct} accent={p.accent} tone={p.weekly.pace?.state}
      sub={p.weekly.pct + '% used'} foot={p.weekly.resetsIn ? 'Resets in ' + p.weekly.resetsIn : null} />
  );

  return (
    <div className={'detail' + (dense ? ' detail--dense' : '')} style={{ '--pa': p.accent }}>
      <div className="detail__head">
        <div className="detail__id">
          <span className="glyph" style={{ color: p.accent }}>{p.glyph}</span>
          <div>
            <div className="detail__name">{p.name}</div>
            <div className="detail__upd mono faint">Updated {p.updated}</div>
          </div>
        </div>
        {p.plan && <span className="plan mono">{p.plan}</span>}
      </div>

      {meters.length > 0 && <div className="detail__grid">{meters}</div>}

      {p.weekly?.pace && (
        <div className="detail__pace">
          Pace: <PaceTag pace={p.weekly.pace} /> · projected to {p.weekly.pace.delta > 0 ? 'hit limit early' : 'last to reset'}
        </div>
      )}

      {p.models && (
        <>
          <div className="rule" />
          <div className="models">
            <div className="sec-label">Models</div>
            {p.models.map((m) => (
              <div className="model" key={m.name}>
                <span className="model__name mono">{m.name}</span>
                <div className="model__bar"><Bar value={m.pct} accent={p.accent} height={6} /></div>
                <span className="model__pct mono dim">{pct(m.pct)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {p.extra && (
        <>
          <div className="rule" />
          <div className="extra">
            <div className="meter__top">
              <span className="meter__label">{p.extra.title}</span>
              <span className="mono dim">{pct(p.extra.pct)} used</span>
            </div>
            <Bar value={p.extra.pct} accent={p.accent} />
          </div>
        </>
      )}

      {(() => {
        const ref = p.cost.last30 || p.cost.today;
        const tokenMode = !!ref && ref.usd == null; // flat-rate provider (e.g. Z.AI) → tokens, not $
        const val = (c) => (c.usd != null ? fmtUSD(c.usd) : fmtTok(c.tokens));
        const sub = (c) => (c.usd != null ? fmtTok(c.tokens) + ' tok' : 'tokens');
        return (
          <>
            <div className="rule" />
            <div className="cost">
              <div className="sec-label">{tokenMode ? 'Tokens' : 'Cost'}</div>
              {(p.cost.today || p.cost.last30 || p.spend14) ? (
                <>
                  <div className="cost__rows">
                    {p.cost.today && (
                      <div className="cost__row">
                        <span className="mono faint">Today</span>
                        <span className="mono">{val(p.cost.today)}</span>
                        <span className="mono faint">{sub(p.cost.today)}</span>
                      </div>
                    )}
                    {p.cost.last30 && (
                      <div className="cost__row">
                        <span className="mono faint">Last 30 days</span>
                        <span className="mono">{val(p.cost.last30)}</span>
                        <span className="mono faint">{sub(p.cost.last30)}</span>
                      </div>
                    )}
                  </div>
                  {p.spend14 && (
                    <div className="cost__chart">
                      <div className="sec-label faint">{tokenMode ? 'Daily tokens · 14d' : 'Daily spend · 14d'}</div>
                      <MiniBars data={p.spend14} accent={p.accent} fmt={tokenMode ? ((n) => fmtTok(n) + ' tok') : fmtUSD} />
                    </div>
                  )}
                </>
              ) : (
                <div className="cost__none mono faint">No local cost data — codexbar reads cost from Claude/Codex CLI logs only.</div>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}

/* ---------------- grid card ---------------- */
export function ProviderCard({ p, onOpen, active }) {
  return (
    <button className={'pcard' + (active ? ' pcard--active' : '')} style={{ '--pa': p.accent }} onClick={() => onOpen(p.id)}>
      <div className="pcard__head">
        <span className="glyph" style={{ color: p.accent }}>{p.glyph}</span>
        <span className="pcard__name">{p.name}</span>
        <StatusDot status={p.status} />
        {p.plan && <span className="plan mono">{p.plan}</span>}
      </div>
      {p.error ? (
        <div className="perr">⚠ <span className="mono">{p.error}</span></div>
      ) : (
        <>
          <div className="pcard__meters">
            {p.session && (
              <div className="pcard__meter">
                <div className="pcard__mtop"><span className="faint mono">SESSION</span><span className="mono">{pct(p.session.pct)}</span></div>
                <Bar value={p.session.pct} accent={p.accent} height={6} />
              </div>
            )}
            {p.weekly && (
              <div className="pcard__meter">
                <div className="pcard__mtop"><span className="faint mono">WEEKLY</span><span className="mono">{pct(p.weekly.pct)}</span></div>
                <Bar value={p.weekly.pct} accent={p.accent} tone={p.weekly.pace?.state} height={6} />
              </div>
            )}
          </div>
          <div className="pcard__foot">
            <div className="pcard__cost">
              <span className="num">{p.cost.last30 ? (p.cost.last30.usd != null ? fmtUSD(p.cost.last30.usd) : fmtTok(p.cost.last30.tokens)) : '—'}</span>
              <span className="faint mono">{p.cost.last30 && p.cost.last30.usd == null ? 'tok · 30d' : '30d'}</span>
            </div>
            {p.spend14 && <MiniBars data={p.spend14} accent={p.accent} height={26} fmt={p.cost.last30 && p.cost.last30.usd == null ? ((n) => fmtTok(n) + ' tok') : fmtUSD} />}
          </div>
        </>
      )}
    </button>
  );
}

/* ---------------- sidebar row ---------------- */
export function ProviderRow({ p, active, onSelect }) {
  return (
    <button className={'prow' + (active ? ' prow--active' : '')} style={{ '--pa': p.accent }} onClick={() => onSelect(p.id)}>
      <span className="glyph" style={{ color: p.accent }}>{p.glyph}</span>
      <div className="prow__mid">
        <div className="prow__top">
          <span className="prow__name">{p.name}</span>
          <StatusDot status={p.status} />
        </div>
        <div className="prow__bar">
          <Bar value={p.weekly?.pct ?? p.session?.pct ?? 0} accent={p.accent} tone={p.weekly?.pace?.state} height={5} />
        </div>
      </div>
      <span className="prow__pct mono">{pct(p.weekly?.pct ?? p.session?.pct ?? 0)}</span>
    </button>
  );
}
