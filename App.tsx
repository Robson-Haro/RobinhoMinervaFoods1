*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --red: #C41E3A; --red-dark: #8B1325; --red-light: #E8374F;
  --gold: #C9A84C; --gold-light: #E8C97E;
  --dark: #0A0A0F; --dark2: #12121A; --dark3: #1A1A26;
  --text: #F0EEE8; --text-muted: rgba(240,238,232,0.55); --text-dim: rgba(240,238,232,0.3);
  --border: rgba(255,255,255,0.12); --border2: rgba(201,168,76,0.3);
  --green: #2ECC71; --orange: #E67E22; --blue: #3498DB;
  --glass-bg: rgba(255,255,255,0.09); --glass-border: rgba(255,255,255,0.18);
  --glass-shadow: 0 8px 32px rgba(0,0,0,0.22);
  --radius: 12px; --radius-lg: 16px;
  --font: 'Inter', -apple-system, sans-serif;
}

html, body {
  font-family: var(--font); background: var(--dark); color: var(--text);
  min-height: 100vh; overflow-x: hidden; -webkit-font-smoothing: antialiased;
  background-image:
    radial-gradient(ellipse 80% 50% at 20% 10%, rgba(196,30,58,0.12) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 80%, rgba(201,168,76,0.07) 0%, transparent 50%);
  background-attachment: fixed;
}

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: var(--dark); }
::-webkit-scrollbar-thumb { background: var(--red); border-radius: 2px; }

.glass {
  background: var(--glass-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border: 0.5px solid var(--glass-border); border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
}

.skeu {
  background: linear-gradient(145deg, #1e1e2e, #16162a);
  border: 0.5px solid rgba(255,255,255,0.07); border-radius: var(--radius);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.4);
}

input, select, textarea {
  font-family: var(--font); font-size: 13px; color: var(--text);
  background: rgba(255,255,255,0.06); border: 0.5px solid var(--border);
  border-radius: 8px; padding: 9px 13px; width: 100%;
  transition: border-color .18s, background .18s; outline: none;
}
input:focus, select:focus, textarea:focus { border-color: var(--gold); background: rgba(255,255,255,0.09); }
input::placeholder, textarea::placeholder { color: var(--text-dim); }
select { appearance: none; cursor: pointer; }
textarea { resize: vertical; line-height: 1.6; }

@keyframes fadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

.fade-in { animation: fadeIn .25s ease; }
.pulse { animation: pulse 1.8s infinite; }
