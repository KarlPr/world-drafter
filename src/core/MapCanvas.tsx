import { useEffect, useRef } from 'react'
import type { Layers } from './layers.ts'
import type { MapMode } from './mapMode.ts'

/** Imperative viewport. Zoom/pan is a canvas transform over a full-res raster; the data is never resampled. */
export function MapCanvas({ layers, mode }: { layers: Layers; mode: MapMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef({ x: 0, y: 0, scale: 0 }) // scale 0 = fit to viewport on first draw

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const raster = rasterize(layers, mode) // ponytail: full re-raster per mode switch; cache per mode if it drags

    const draw = () => {
      const v = view.current
      if (!v.scale) v.scale = Math.min(canvas.width / layers.width, canvas.height / layers.height)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false
      ctx.setTransform(v.scale, 0, 0, v.scale, v.x, v.y)
      ctx.drawImage(raster, 0, 0)
    }
    const resize = new ResizeObserver(() => {
      canvas.width = canvas.clientWidth
      canvas.height = canvas.clientHeight
      draw()
    })
    resize.observe(canvas)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = view.current
      const k = Math.exp(-e.deltaY * 0.001)
      v.x = e.offsetX - (e.offsetX - v.x) * k
      v.y = e.offsetY - (e.offsetY - v.y) * k
      v.scale *= k
      draw()
    }
    const onMove = (e: PointerEvent) => {
      if (!(e.buttons & 1)) return
      view.current.x += e.movementX
      view.current.y += e.movementY
      draw()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointermove', onMove)
    return () => {
      resize.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointermove', onMove)
    }
  }, [layers, mode])

  return (
    <div className="viewport">
      <canvas ref={canvasRef} />
    </div>
  )
}

function rasterize(layers: Layers, mode: MapMode): HTMLCanvasElement {
  const { width, height } = layers
  const img = new ImageData(width, height)
  const d = img.data
  for (let i = 0, j = 0; i < width * height; i++, j += 4) {
    const rgb = mode.color(layers, i)
    d[j] = rgb >> 16
    d[j + 1] = (rgb >> 8) & 255
    d[j + 2] = rgb & 255
    d[j + 3] = 255
  }
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c
}
