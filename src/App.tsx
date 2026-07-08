import './App.css'

/**
 * S-0 — Scaffold mínimo. Sin lógica de negocio (ni tablas, ni RPC, ni pantallas).
 * El layout, el routing y las pantallas reales empiezan en S-C (ver docs/ROADMAP.md).
 * El cliente Supabase vive en src/lib/supabase.ts y se conectará a partir de S-C.
 */
function App() {
  return (
    <main className="app-shell">
      <h1>WMS · Suricato Producciones</h1>
      <p>Cimientos listos (S-0). El sistema se construye por sprints.</p>
      <p className="hint">
        Configura <code>.env</code> a partir de <code>.env.example</code> antes de
        conectar con Supabase.
      </p>
    </main>
  )
}

export default App
