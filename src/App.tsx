import { useMemo, useState } from 'react'
import { MapCanvas } from './core/MapCanvas.tsx'
import { mapModes } from './core/mapMode.ts'
import { newProject } from './core/project.ts'
import { hoi4 } from './profiles/hoi4/index.ts'

export default function App() {
  const project = useMemo(() => newProject(hoi4), []) // ponytail: hard-wired profile; pick by id when a second one exists
  const modes = useMemo(() => mapModes(project.profile), [project])
  const [mode, setMode] = useState(modes[0])

  return (
    <div className="app">
      <aside>
        <h1>{project.profile.name}</h1>
        {modes.map((m) => (
          <button key={m.id} aria-pressed={m === mode} onClick={() => setMode(m)}>
            {m.name}
          </button>
        ))}
      </aside>
      <MapCanvas layers={project.layers} mode={mode} />
    </div>
  )
}
