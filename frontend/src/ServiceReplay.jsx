import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Box,
  Clock3,
  Coffee,
  Flame,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Sandwich,
  Pizza,
} from "lucide-react";
import "./replay.css";

const stations = [
  { name: "Oven", color: "#f58c70", Icon: Pizza },
  { name: "Grill", color: "#f7bc71", Icon: Flame },
  { name: "Prep", color: "#79c4a8", Icon: Sandwich },
  { name: "Beverage", color: "#93b9dc", Icon: Coffee },
];
const activeAt = (tasks, time) =>
  tasks.filter((t) => t.start <= time && time < t.end);

function buildKitchen(T, host) {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-5, 5, 3, -3, 0.1, 55);
  scene.add(new T.HemisphereLight(0xfffaf0, 0x80ad9e, 2.3));
  const sun = new T.DirectionalLight(0xffefcf, 3.2);
  sun.position.set(-3, 8, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  const rim = new T.DirectionalLight(0xb7e6e1, 1.8);
  rim.position.set(4, 5, -4);
  scene.add(rim);
  const root = new T.Group();
  scene.add(root);
  const mats = new Map();
  const geometry = new Map();
  function solid(color, metal = 0) {
    const key = color + "/" + metal;
    if (!mats.has(key))
      mats.set(
        key,
        new T.MeshStandardMaterial({
          color,
          metalness: metal,
          roughness: metal ? 0.48 : 0.77,
        }),
      );
    return mats.get(key);
  }
  function mesh(parent, geo, mat, x, y, z) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(p, x, y, z, w, h, d, color, metal = 0) {
    if (!geometry.has("box")) geometry.set("box", new T.BoxGeometry(1, 1, 1));
    const m = mesh(p, geometry.get("box"), solid(color, metal), x, y, z);
    m.scale.set(w, h, d);
    return m;
  }
  function cylinder(p, x, y, z, top, bottom, h, color, segments = 20) {
    const key = [top, bottom, h, segments].join("/");
    if (!geometry.has(key))
      geometry.set(key, new T.CylinderGeometry(top, bottom, h, segments));
    return mesh(p, geometry.get(key), solid(color), x, y, z);
  }
  function sphere(p, x, y, z, rx, ry, rz, color, half = false) {
    const key = "sphere" + half;
    if (!geometry.has(key))
      geometry.set(
        key,
        new T.SphereGeometry(
          1,
          24,
          12,
          0,
          Math.PI * 2,
          0,
          half ? Math.PI / 2 : Math.PI,
        ),
      );
    const m = mesh(p, geometry.get(key), solid(color), x, y, z);
    m.scale.set(rx, ry, rz);
    return m;
  }

  // A bevel-like layered ceramic plinth with a glazed tile surface.
  box(root, 0, -0.18, 0, 7.85, 0.28, 5.82, "#447c72");
  box(root, 0, -0.039, 0, 7.78, 0.08, 5.75, "#abc7b9");
  box(root, 0, 0.008, 0, 7.72, 0.035, 5.69, "#88b4a6");
  for (let i = -3.5; i <= 3.5; i += 0.5)
    box(root, i, 0.028, 0, 0.016, 0.008, 5.68, "#bad7c7");
  for (let i = -2.5; i <= 2.5; i += 0.5)
    box(root, 0, 0.028, i, 7.72, 0.008, 0.016, "#bad7c7");

  const machines = {};
  const dark = "#293f40",
    steel = "#adc2bc",
    chrome = "#d5dfd5",
    ivory = "#eee7d3",
    coral = "#d86649";
  function island(name, x, z, color) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    root.add(g);
    box(g, 0, 0.07, 0, 2.75, 0.09, 1.88, "#698e82");
    box(g, 0, 0.43, 0, 2.44, 0.69, 1.46, steel, 0.32);
    box(g, 0, 0.86, 0, 2.58, 0.14, 1.59, chrome, 0.45);
    box(g, 0, 0.78, 0.743, 2.41, 0.09, 0.035, color);
    for (const side of [-1, 1]) {
      box(g, 0.59 * side, 0.45, 0.746, 1.12, 0.47, 0.035, "#869e96", 0.28);
      box(g, 0.59 * side, 0.62, 0.781, 0.3, 0.035, 0.06, dark);
      for (const front of [-1, 1])
        box(g, 1.03 * side, 0.12, front * 0.55, 0.11, 0.2, 0.11, dark);
    }
    const glow = new T.MeshStandardMaterial({
      color: "#435c53",
      emissive: 0x000000,
    });
    const status = mesh(g, geometry.get("box"), glow, 0.99, 0.78, 0.769);
    status.scale.set(0.22, 0.065, 0.04);
    const halo = cylinder(g, -1.12, 0.13, 0.83, 0.095, 0.1, 0.03, color);
    halo.material = new T.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.25,
    });
    const vapor = new T.Group();
    g.add(vapor);
    const puffs = [];
    for (let i = 0; i < 4; i++) {
      const puff = sphere(vapor, 0, 0, 0, 0.06, 0.08, 0.06, "#d9efe0");
      puff.castShadow = false;
      puff.receiveShadow = false;
      puffs.push(puff);
    }
    machines[name] = {
      g,
      glow,
      halo,
      vapor,
      puffs,
      color,
      source: [0, 1.6, 0],
    };
    return g;
  }
  const oven = island("Oven", -1.85, -1.38, stations[0].color);
  // Brick oven, arch mouth, firebrick floor, chimney and cap.
  box(oven, 0, 1.02, -0.025, 2.02, 0.2, 1.35, "#ad5441");
  sphere(oven, 0, 1.09, -0.08, 1.0, 0.86, 0.69, coral, true);
  function arch(x, y, z, w, h, color) {
    const path = new T.Shape();
    path.moveTo(-w / 2, 0);
    path.lineTo(w / 2, 0);
    path.lineTo(w / 2, h - w / 2);
    path.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    path.closePath();
    const geo = new T.ExtrudeGeometry(path, {
      depth: 0.065,
      bevelEnabled: false,
      curveSegments: 18,
    });
    return mesh(oven, geo, solid(color), x, y, z);
  }
  arch(0, 1.02, 0.48, 1.12, 0.81, "#eaa976");
  arch(0, 1.04, 0.556, 0.88, 0.64, "#472f2c");
  box(oven, 0, 1.056, 0.65, 1.23, 0.07, 0.35, "#c5966b");
  for (let i = 0; i < 3; i++)
    sphere(
      oven,
      (i - 1) * 0.17,
      1.11,
      0.62,
      0.07,
      0.13 + (i % 2) * 0.07,
      0.06,
      "#ff9c49",
      true,
    );
  cylinder(oven, -0.54, 1.94, -0.31, 0.14, 0.18, 0.63, "#a95643");
  cylinder(oven, -0.54, 2.27, -0.31, 0.21, 0.22, 0.09, "#e4aa7e");
  machines.Oven.source = [-0.54, 2.35, -0.31];
  const grill = island("Grill", 1.68, -1.38, stations[1].color);
  box(grill, 0, 0.99, -0.12, 2.18, 0.18, 1.13, dark, 0.28);
  box(grill, 0, 1.1, -0.66, 2.21, 0.26, 0.07, steel, 0.35);
  for (let i = 0; i < 13; i++)
    box(
      grill,
      -0.93 + i * 0.155,
      1.092,
      -0.1,
      0.055,
      0.048,
      0.93,
      "#646960",
      0.35,
    );
  for (const [x, z] of [
    [-0.48, 0.14],
    [0.27, -0.2],
    [0.59, 0.17],
  ]) {
    cylinder(grill, x, 1.15, z, 0.195, 0.215, 0.075, "#985c39");
    for (let i = -1; i <= 1; i++)
      box(grill, x + i * 0.075, 1.19, z, 0.016, 0.009, 0.24, "#4f3b31");
  }
  for (let i = 0; i < 4; i++)
    sphere(grill, -0.67 + i * 0.43, 0.78, 0.82, 0.064, 0.064, 0.045, dark);
  machines.Grill.source = [0.15, 1.19, -0.1];
  const prep = island("Prep", -1.85, 1.29, stations[2].color);
  box(prep, -0.35, 0.97, 0.02, 1.18, 0.075, 0.86, "#ba8955");
  for (let i = 0; i < 4; i++)
    sphere(
      prep,
      -0.61 + i * 0.15,
      1.06,
      0.05 + (i % 2) * 0.1,
      0.12,
      0.1,
      0.1,
      "#71925a",
    );
  sphere(prep, -0.55, 1.08, -0.19, 0.14, 0.12, 0.13, "#df7250");
  const knife = box(prep, 0.01, 1.024, 0.25, 0.37, 0.025, 0.09, chrome, 0.6);
  knife.rotation.y = 0.27;
  box(prep, 0.72, 1.03, -0.26, 0.54, 0.15, 0.48, steel, 0.4);
  for (let i = 0; i < 5; i++)
    cylinder(prep, 0.72, 1.02 + i * 0.04, 0.35, 0.26, 0.18, 0.045, ivory);
  machines.Prep.source = [-0.35, 1.08, 0];
  const bar = island("Beverage", 1.68, 1.29, stations[3].color);
  box(bar, -0.23, 1.05, -0.08, 1.43, 0.21, 1.12, dark, 0.2);
  box(bar, -0.23, 1.43, -0.42, 1.29, 0.79, 0.34, "#577f8e", 0.24);
  box(bar, -0.23, 1.84, -0.15, 1.43, 0.28, 0.86, "#87aeb8", 0.3);
  box(bar, -0.23, 1.82, 0.3, 1.27, 0.15, 0.075, chrome, 0.42);
  for (const x of [-0.56, 0.09]) {
    cylinder(bar, x, 1.65, 0.16, 0.08, 0.075, 0.13, dark);
    cylinder(bar, x, 1.23, 0.17, 0.13, 0.095, 0.23, ivory);
    cylinder(bar, x, 1.347, 0.17, 0.098, 0.1, 0.006, "#784e37");
    sphere(bar, x + 0.13, 1.25, 0.17, 0.055, 0.07, 0.04, ivory);
  }
  cylinder(bar, 0.84, 1.19, -0.11, 0.18, 0.22, 0.4, dark);
  cylinder(bar, 0.84, 1.51, -0.11, 0.24, 0.14, 0.24, "#815d42");
  cylinder(bar, 0.84, 1.65, -0.11, 0.24, 0.24, 0.04, steel);
  machines.Beverage.source = [-0.56, 1.35, 0.17];

  let yaw = 0.63;
  let lastActive = [];
  let lastTime = 0;
  function frame(active = lastActive, time = lastTime) {
    lastActive = active;
    lastTime = time;
    for (const [key, station] of Object.entries(machines)) {
      const on = active.some((t) => t.station === key);
      station.glow.color.set(on ? station.color : "#435c53");
      station.glow.emissive.set(on ? station.color : 0x000000);
      station.glow.emissiveIntensity = on ? 0.55 : 0;
      station.halo.material.emissiveIntensity = on ? 1 : 0.04;
      station.vapor.visible = on;
      if (on) {
        const [x, y, z] = station.source;
        for (let i = 0; i < 4; i++) {
          const phase = (time * 0.32 + i / 4) % 1,
            p = station.puffs[i];
          const prepWork = key === "Prep";
          p.position.set(
            x + Math.sin(phase * 6 + i) * 0.1,
            y + 0.07 + phase * (prepWork ? 0.28 : 0.7),
            z + Math.sin(phase * 3) * 0.06,
          );
          p.scale.setScalar(
            0.025 + Math.sin(phase * Math.PI) * (prepWork ? 0.031 : 0.06),
          );
          p.material = solid(prepWork ? "#91ab6b" : "#d9efe0");
        }
      }
    }
    camera.position.set(12 * Math.sin(yaw), 9.1, 12 * Math.cos(yaw));
    camera.lookAt(0, 0.63, 0);
    renderer.render(scene, camera);
  }
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    const aspect = w / h,
      span = Math.max(6.55, 10.0 / aspect);
    Object.assign(camera, {
      left: (-span * aspect) / 2,
      right: (span * aspect) / 2,
      top: span / 2,
      bottom: -span / 2,
    });
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    frame();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  return {
    frame,
    rotate(angle) {
      yaw += angle;
      frame();
    },
    dispose() {
      observer.disconnect();
      const geos = new Set(),
        materials = new Set();
      scene.traverse((obj) => {
        if (obj.geometry) geos.add(obj.geometry);
        if (obj.material) materials.add(obj.material);
      });
      geos.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

function Stage({ items, time }) {
  const host = useRef(null),
    engine = useRef(null),
    drag = useRef(null),
    last = useRef({ items, time });
  const [mode, setMode] = useState("loading");
  last.current = { items, time };
  useEffect(() => {
    let closed = false;
    import("three")
      .then((T) => {
        if (closed) return;
        engine.current = buildKitchen(T, host.current);
        engine.current.frame(last.current.items, last.current.time);
        setMode("ready");
      })
      .catch(() => {
        if (!closed) setMode("fallback");
      });
    return () => {
      closed = true;
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.frame(items, time);
  }, [items, time]);
  const turn = (amount) => engine.current?.rotate(amount);
  return (
    <div className="sr-stage">
      <div
        className="sr-webgl"
        ref={host}
        aria-hidden="true"
        onPointerDown={(e) => {
          if (!engine.current) return;
          drag.current = e.clientX;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current == null) return;
          turn((drag.current - e.clientX) * 0.009);
          drag.current = e.clientX;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      />
      {mode === "ready" && (
        <div className="sr-orbit" role="group" aria-label="Rotate kitchen view">
          <button
            type="button"
            onClick={() => turn(-Math.PI / 6)}
            aria-label="Rotate left"
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            onClick={() => turn(Math.PI / 6)}
            aria-label="Rotate right"
          >
            <RotateCw size={14} />
          </button>
        </div>
      )}
      {mode === "loading" && (
        <span className="sr-loading" role="status">
          Preparing kitchen view…
        </span>
      )}
      {mode === "fallback" && (
        <div className="sr-fallback" aria-label="Kitchen station map">
          {stations.map(({ name, Icon, color }) => (
            <div
              key={name}
              style={{ "--station-color": color }}
              className={items.some((t) => t.station === name) ? "sr-on" : ""}
            >
              <Icon size={26} />
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Player({ result }) {
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const timeRef = useRef(0),
    slider = useId();
  const tasks = result.tasks,
    end = result.ready;
  const current = useMemo(() => activeAt(tasks, time), [tasks, time]);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (motion.matches) setPlaying(false);
    };
    const visibility = () => {
      if (document.hidden) setPlaying(false);
    };
    motion.addEventListener("change", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      motion.removeEventListener("change", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let animation,
      previous = performance.now();
    // One full replay lasts approximately 20 s. The slider always reads scheduled minutes.
    const speed = end / 20000;
    function tick(now) {
      if (now - previous >= 40) {
        const next = Math.min(end, timeRef.current + (now - previous) * speed);
        previous = now;
        timeRef.current = next;
        setTime(next);
        if (next >= end) {
          setPlaying(false);
          return;
        }
      }
      animation = requestAnimationFrame(tick);
    }
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, end]);
  function seek(value) {
    timeRef.current = value;
    setTime(value);
  }
  function toggle() {
    if (timeRef.current >= end) seek(0);
    setPlaying((p) => !p);
  }
  return (
    <section className="sr-panel panel" aria-label="Kitchen service replay">
      <header className="sr-header">
        <div className="sr-heading-icon">
          <Box size={20} />
        </div>
        <div>
          <h2>Service replay</h2>
          <p>Follow each station from acceptance to pickup.</p>
        </div>
      </header>
      <Stage items={current} time={time} />
      <div className="sr-transport">
        <button
          className="sr-play"
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause replay" : "Play replay"}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <label htmlFor={slider} className="sr-visually-hidden">
          Schedule position in minutes
        </label>
        <input
          id={slider}
          type="range"
          min="0"
          max={end}
          step="any"
          value={time}
          aria-valuetext={time.toFixed(2) + " minutes"}
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value));
          }}
        />
        <span className="sr-clock">
          <Clock3 size={12} />
          {time.toFixed(1)} / {end.toFixed(1)} min
        </span>
      </div>
      <div
        className="sr-stations"
        aria-label="Station activity at selected time"
      >
        {stations.map(({ name, Icon, color }) => {
          const running = current.filter((t) => t.station === name);
          const status = running
            .map((t) =>
              t.active ? "In progress" : t.dish + " × " + t.quantity,
            )
            .join(", ");
          return (
            <div
              className={"sr-station " + (running.length ? "sr-active" : "")}
              key={name}
            >
              <span className="sr-symbol" style={{ "--station-color": color }}>
                <Icon size={15} />
              </span>
              <div>
                <b>{name}</b>
                <small title={status || "Idle"}>{status || "Idle"}</small>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ServiceReplay({ result }) {
  if (
    !result?.tasks?.length ||
    !Number.isFinite(result.ready) ||
    result.ready <= 0
  )
    return null;
  return (
    <Player
      key={JSON.stringify([
        result.model,
        result.version,
        result.tasks.map((t) => [
          t.id,
          t.order,
          t.dish,
          t.quantity,
          t.station,
          t.start,
          t.end,
        ]),
      ])}
      result={result}
    />
  );
}
