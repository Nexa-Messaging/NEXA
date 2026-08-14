export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div className="card" style={{ maxWidth: 360, textAlign: 'center' }}>
        <h1 style={{ marginTop: 0 }}>404</h1>
        <p className="muted">That page does not exist.</p>
        <a className="btn" href="/">
          Back to overview
        </a>
      </div>
    </main>
  );
}
