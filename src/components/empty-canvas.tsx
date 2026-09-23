export function EmptyCanvas() {
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"

  return (
    <div className="wiki-empty">
      <div className="wiki-empty-mark">
        <img src="/wiki-web-icon.png" alt="" width={36} height={36} />
      </div>
      <h1 className="wiki-empty-title">Wiki-Web</h1>
      <p className="wiki-empty-copy">Pick a note in the sidebar, or search.</p>
      <p className="wiki-empty-hint">
        <kbd>{mod}</kbd>
        <kbd>K</kbd>
        <span>search vault</span>
      </p>
    </div>
  )
}
