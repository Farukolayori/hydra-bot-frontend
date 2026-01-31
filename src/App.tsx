import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { 
  TrendingUp, Activity, Zap, Server, Clock, Search, 
  ArrowUpRight, ArrowDownRight, LayoutGrid, Terminal as TerminalIcon
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface PriceData {
  timestamp: number;
  price: number;
}

interface Stats {
  total_scanned: number;
  total_executed: number;
  net_profit: number;
  balance: number;
}

interface MarketTicker {
  pair: string;
  binance: number;
  uniswap: number;
  spread: number;
  timestamp: number;
  isUpdating?: boolean; // UI helper
}

interface Opportunity {
  id: string;
  time: string;
  pair: string;
  type: string;
  spread: number;
  profit: number;
  status: 'EXECUTED' | 'PENDING' | 'SKIPPED';
}

interface Log {
  id: number;
  time: string;
  msg: string;
  type: 'info' | 'success' | 'warn';
}

// ============================================================================
// MAIN TERMINAL COMPONENT
// ============================================================================

const HydraTerminal: React.FC = () => {
  // --- STATE ---
  const [isConnected, setIsConnected] = useState(false);
  const [ethPrice, setEthPrice] = useState(0);
  const [priceHistory, setPriceHistory] = useState<PriceData[]>([]);
  const [marketWatch, setMarketWatch] = useState<Record<string, MarketTicker>>({});
  const [logs, setLogs] = useState<Log[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_scanned: 0,
    total_executed: 0,
    net_profit: 0.00,
    balance: 10000.00,
  });
  
  const logEndRef = useRef<HTMLDivElement>(null);

  // --- WEBSOCKET CONNECTION ---
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
ws = new WebSocket('wss://jubilant-funicular-69rwr5q9gp6r2jg-3000.app.github.dev/ws');
        
        ws.onopen = () => {
          setIsConnected(true);
          addLog('SYSTEM', 'Connected to Hydra Liquidity Node [Mainnet]', 'success');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleData(data);
          } catch (e) { console.error(e); }
        };

        ws.onclose = () => {
          setIsConnected(false);
          addLog('SYSTEM', 'Connection lost. Reconnecting...', 'warn');
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch (e) { reconnectTimer = setTimeout(connect, 3000); }
    };

    connect();
    return () => { if (ws) ws.close(); clearTimeout(reconnectTimer); };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
        logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // --- DATA HANDLER ---
  const handleData = useCallback((data: any) => {
    // 1. Market Watch Updates (Multi-Asset)
    if (data.type === 'ScannerUpdate') {
      const binance = data.dex_prices['Binance'] || 0;
      const uniswap = data.dex_prices['Uniswap V3'] || 0;
      const spread = uniswap > 0 ? ((binance - uniswap) / uniswap) * 100 : 0;
      
      setMarketWatch(prev => {
        // Reset updating flags on other coins
        const resetPrev = Object.keys(prev).reduce((acc, key) => {
            acc[key] = { ...prev[key], isUpdating: false };
            return acc;
        }, {} as Record<string, MarketTicker>);

        return {
            ...resetPrev,
            [data.pair]: {
                pair: data.pair,
                binance,
                uniswap,
                spread: Math.abs(spread),
                timestamp: Date.now(),
                isUpdating: true // Highlight this one
            }
        };
      });

      setStats(prev => ({ ...prev, total_scanned: prev.total_scanned + 1 }));
    }

    // 2. Main Chart (ETH Only)
    if (data.type === 'EthPrice') {
      setEthPrice(data.price);
      setPriceHistory(prev => {
        const next = [...prev, { timestamp: Date.now(), price: data.price }];
        return next.slice(-100); // Keep last 100 points
      });
    }

    // 3. Opportunities
    if (data.type === 'RealOpportunity') {
      const raw = data.opportunity;
      const isExec = raw.status === 'EXECUTABLE';
      
      const newOpp: Opportunity = {
        id: raw.id,
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        pair: raw.pair,
        type: 'ARB',
        spread: raw.spread_pct,
        profit: raw.net_profit,
        status: isExec ? 'EXECUTED' : 'SKIPPED'
      };

      setOpportunities(prev => [newOpp, ...prev].slice(0, 50));
      
      if (isExec) {
        setStats(prev => ({
          ...prev,
          total_executed: prev.total_executed + 1,
          net_profit: prev.net_profit + raw.net_profit,
          balance: prev.balance + raw.net_profit
        }));
        addLog('EXECUTION', `Arbitrage Executed on ${raw.pair} | Net: +$${raw.net_profit.toFixed(2)}`, 'success');
      } 
    }
  }, []);

  const addLog = (source: string, msg: string, type: Log['type'] = 'info') => {
    setLogs(prev => [...prev.slice(-99), { 
      id: Date.now(), 
      time: new Date().toLocaleTimeString('en-US', { hour12: false }), 
      msg: `[${source}] ${msg}`, 
      type 
    }]);
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="terminal">
      <style>{`
        :root {
          --bg-main: #0b0e11;
          --bg-panel: #161a1e;
          --border: #2b3139;
          --text-primary: #eaecef;
          --text-secondary: #848e9c;
          --up: #0ecb81;
          --down: #f6465d;
          --accent: #FCD535;
          --font-mono: 'JetBrains Mono', 'Roboto Mono', monospace;
        }
        
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg-main); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; height: 100vh; overflow: hidden; }
        
        .terminal { display: flex; flex-direction: column; height: 100vh; }
        
        /* HEADER */
        .header { height: 50px; background: var(--bg-panel); border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 1rem; justify-content: space-between; }
        .logo { font-weight: 900; font-size: 1.1rem; color: var(--text-primary); display: flex; align-items: center; gap: 8px; letter-spacing: 1px; }
        .status-badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; background: rgba(14, 203, 129, 0.15); color: var(--up); border: 1px solid rgba(14, 203, 129, 0.3); font-family: var(--font-mono); }
        .disconnected { background: rgba(246, 70, 93, 0.15); color: var(--down); border-color: rgba(246, 70, 93, 0.3); }
        
        /* MAIN LAYOUT */
        .grid-container { display: grid; grid-template-columns: 250px 1fr 320px; flex: 1; overflow: hidden; }
        
        /* LEFT SIDEBAR */
        .sidebar { background: var(--bg-main); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
        .nav-btn { padding: 12px 20px; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 0.9rem; transition: 0.2s; }
        .nav-btn:hover, .nav-btn.active { background: var(--bg-panel); color: var(--text-primary); border-left: 3px solid var(--accent); }
        .stats-box { margin-top: auto; padding: 1.5rem; border-top: 1px solid var(--border); }
        .stat-label { font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; }
        .stat-val { font-size: 1.2rem; font-family: var(--font-mono); font-weight: 600; margin-bottom: 1rem; }
        
        /* CENTER PANEL */
        .center-panel { display: flex; flex-direction: column; background: var(--bg-main); overflow: hidden; }
        
        /* TOP BAR INFO */
        .ticker-bar { height: 60px; border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 1.5rem; gap: 2rem; background: var(--bg-panel); }
        .ticker-item { display: flex; flex-direction: column; }
        .ticker-label { font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 5px; }
        .ticker-value { font-size: 1.1rem; font-family: var(--font-mono); font-weight: 500; }
        .ticker-value.up { color: var(--up); }
        
        /* CHART AREA */
        .chart-area { flex: 2; padding: 1rem; position: relative; min-height: 300px; }
        .chart-title { position: absolute; top: 1rem; left: 1rem; font-size: 0.8rem; color: var(--text-secondary); z-index: 10; }
        
        /* LOGS / TERMINAL */
        .terminal-logs { flex: 1; border-top: 1px solid var(--border); background: #000; font-family: var(--font-mono); font-size: 0.8rem; display: flex; flex-direction: column; }
        .terminal-header { padding: 8px 16px; background: var(--bg-panel); color: var(--text-secondary); font-size: 0.75rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 6px; }
        .log-content { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 4px; }
        .log-line { display: flex; gap: 10px; }
        .log-time { color: #555; }
        .log-msg { color: var(--text-primary); }
        .log-success { color: var(--up); }
        .log-warn { color: var(--accent); }
        
        /* RIGHT PANEL (MARKET WATCH) */
        .market-watch { background: var(--bg-panel); border-left: 1px solid var(--border); display: flex; flex-direction: column; }
        .panel-header { padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 0.9rem; display: flex; justify-content: space-between; align-items: center; }
        
        .market-list { flex: 1; overflow-y: auto; }
        .market-row { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 10px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: 0.1s; }
        .market-row:hover { background: rgba(255,255,255,0.03); }
        .market-row.active { background: rgba(14, 203, 129, 0.05); border-left: 2px solid var(--up); }
        
        .col-pair { font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 5px; }
        .col-price { text-align: right; font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-secondary); }
        .col-spread { text-align: right; font-family: var(--font-mono); font-size: 0.85rem; font-weight: 700; }
        .spread-pos { color: var(--up); }
        
        /* OPPORTUNITY LIST */
        .opp-list { flex: 1; border-top: 1px solid var(--border); display: flex; flex-direction: column; }
        .opp-row { display: flex; justify-content: space-between; padding: 8px 16px; border-bottom: 1px solid var(--border); font-size: 0.8rem; }
        .tag { padding: 2px 4px; border-radius: 3px; font-size: 0.7rem; font-weight: 700; }
        .tag.EXECUTED { background: var(--up); color: #000; }
        .tag.SKIPPED { background: var(--bg-main); color: var(--text-secondary); border: 1px solid var(--border); }
        
        /* SCROLLBARS */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: var(--bg-main); }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }
      `}</style>

      {/* HEADER */}
      <header className="header">
        <div className="logo">
          <Zap size={18} fill="#FCD535" color="#FCD535"/> HYDRA TERMINAL <span style={{fontSize:'0.7rem', opacity:0.5, fontWeight:400}}>PRO v12</span>
        </div>
        <div className={`status-badge ${isConnected ? '' : 'disconnected'}`}>
          {isConnected ? '● SYSTEM ONLINE' : '○ DISCONNECTED'}
        </div>
      </header>

      <div className="grid-container">
        
        {/* LEFT NAV & STATS */}
        <div className="sidebar">
          <div className="nav-btn active"><LayoutGrid size={16}/> Overview</div>
          <div className="nav-btn"><Activity size={16}/> Performance</div>
          <div className="nav-btn"><Server size={16}/> Nodes</div>
          
          <div className="stats-box">
            <div className="stat-label">Total Net Profit</div>
            <div className="stat-val" style={{color: 'var(--up)'}}>{formatCurrency(stats.net_profit)}</div>
            
            <div className="stat-label">Trading Capital</div>
            <div className="stat-val">{formatCurrency(stats.balance)}</div>
            
            <div className="stat-label">Scans / Executions</div>
            <div className="stat-val" style={{fontSize:'0.9rem'}}>{stats.total_scanned.toLocaleString()} / {stats.total_executed}</div>
          </div>
        </div>

        {/* CENTER MAIN */}
        <div className="center-panel">
          {/* TICKER */}
          <div className="ticker-bar">
            <div className="ticker-item">
              <span className="ticker-label"><TrendingUp size={14}/> ETH/USDC (Binance)</span>
              <span className="ticker-value up">${ethPrice.toFixed(2)}</span>
            </div>
            <div className="ticker-item">
              <span className="ticker-label"><Clock size={14}/> Node Time</span>
              <span className="ticker-value">{new Date().toLocaleTimeString()}</span>
            </div>
            <div className="ticker-item">
              <span className="ticker-label">Gas Price</span>
              <span className="ticker-value" style={{color:'var(--accent)'}}>35 Gwei</span>
            </div>
          </div>

          {/* CHART */}
          <div className="chart-area">
            <div className="chart-title">ETH/USDC • LIVE ARBITRAGE FEED</div>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={priceHistory}>
                <defs>
                  <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ecb81" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#0ecb81" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2b3139" vertical={false} />
                <XAxis dataKey="timestamp" hide />
                <YAxis 
                  orientation="right" 
                  domain={['auto', 'auto']} 
                  tick={{fill: '#848e9c', fontSize: 11, fontFamily: 'monospace'}}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => val.toFixed(2)}
                />
                <Tooltip 
                  contentStyle={{backgroundColor: '#161a1e', borderColor: '#2b3139', color: '#eaecef'}}
                  itemStyle={{color: '#0ecb81'}}
                  labelStyle={{display:'none'}}
                  formatter={(val: any) => [Number(val).toFixed(2), 'Price']}
                />
                <Area 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#0ecb81" 
                  strokeWidth={2} 
                  fill="url(#chartFill)" 
                  isAnimationActive={false}
                />
                {priceHistory.length > 0 && (
                    <ReferenceLine y={priceHistory[priceHistory.length - 1].price} stroke="#0ecb81" strokeDasharray="3 3" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* TERMINAL LOGS */}
          <div className="terminal-logs">
            <div className="terminal-header">
              <TerminalIcon size={12}/> SYSTEM EXECUTION LOGS
            </div>
            <div className="log-content">
              {logs.map((log) => (
                <div key={log.id} className="log-line">
                  <span className="log-time">{log.time}</span>
                  <span className={`log-msg ${log.type === 'success' ? 'log-success' : log.type === 'warn' ? 'log-warn' : ''}`}>
                    {log.msg}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: WATCHLIST */}
        <div className="market-watch">
          <div className="panel-header">
            MARKET WATCH <Search size={14}/>
          </div>
          
          <div className="market-list">
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', padding:'8px 16px', fontSize:'0.7rem', color:'var(--text-secondary)'}}>
              <span>PAIR</span>
              <span style={{textAlign:'right'}}>DEX PRICE</span>
              <span style={{textAlign:'right'}}>SPREAD</span>
            </div>
            {Object.values(marketWatch).map((ticker) => (
              <div key={ticker.pair} className={`market-row ${ticker.isUpdating ? 'active' : ''}`}>
                <div className="col-pair">
                    {ticker.isUpdating && <div style={{width:6, height:6, borderRadius:'50%', background:'#0ecb81'}}></div>}
                    {ticker.pair.split('/')[0]}
                </div>
                <div className="col-price">${ticker.uniswap.toFixed(2)}</div>
                <div className={`col-spread ${ticker.spread > 0.05 ? 'spread-pos' : ''}`}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4}}>
                    {ticker.spread.toFixed(3)}%
                    {ticker.spread > 0.05 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12} color="#555"/>}
                  </div>
                </div>
              </div>
            ))}
            {Object.keys(marketWatch).length === 0 && (
                <div style={{padding:'20px', textAlign:'center', fontSize:'0.8rem', color:'#555'}}>Scanning Markets...</div>
            )}
          </div>

          <div className="panel-header" style={{borderTop:'1px solid var(--border)'}}>
            RECENT SIGNALS
          </div>
          <div className="opp-list">
            {opportunities.map((opp) => (
                <div key={opp.id} className="opp-row">
                    <div>
                        <div style={{fontWeight:600}}>{opp.pair}</div>
                        <div style={{fontSize:'0.7rem', color:'var(--text-secondary)'}}>{opp.time}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                        <div style={{color: opp.profit > 0 ? 'var(--up)' : 'var(--text-secondary)', fontWeight:600}}>
                            {opp.profit > 0 ? '+' : ''}{formatCurrency(opp.profit)}
                        </div>
                        <span className={`tag ${opp.status}`}>{opp.status}</span>
                    </div>
                </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default HydraTerminal;