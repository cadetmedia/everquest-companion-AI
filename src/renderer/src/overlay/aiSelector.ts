// The AI capture selector's page (selector.html): draw a box over the frozen picture. A drag
// sends the box, a click without a drag sends 'all' (the whole screen), Esc cancels.

export {}

// The bridge's shape, restated here as the cursor ring does (preload/selector.ts is its source).
interface SelectorBox {
  x: number
  y: number
  width: number
  height: number
}

declare global {
  interface Window {
    eqSelector: {
      getImage: () => Promise<string | null>
      done: (box: SelectorBox | 'all' | null) => void
    }
  }
}

const shot = document.getElementById('shot') as HTMLImageElement
const box = document.getElementById('box') as HTMLDivElement
let start: { x: number; y: number } | null = null

function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): SelectorBox {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

function paint(r: SelectorBox): void {
  box.style.display = 'block'
  box.style.left = `${String(r.x)}px`
  box.style.top = `${String(r.y)}px`
  box.style.width = `${String(r.width)}px`
  box.style.height = `${String(r.height)}px`
}

window.addEventListener('mousedown', (e) => {
  start = { x: e.clientX, y: e.clientY }
  paint(rectFrom(start, start))
})

window.addEventListener('mousemove', (e) => {
  if (start) paint(rectFrom(start, { x: e.clientX, y: e.clientY }))
})

window.addEventListener('mouseup', (e) => {
  if (!start) return
  const r = rectFrom(start, { x: e.clientX, y: e.clientY })
  start = null
  window.eqSelector.done(r.width < 4 || r.height < 4 ? 'all' : r)
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.eqSelector.done(null)
  if (e.key === 'Enter') window.eqSelector.done('all')
})

void window.eqSelector.getImage().then((src) => {
  if (src) shot.src = src
  else window.eqSelector.done(null)
})
