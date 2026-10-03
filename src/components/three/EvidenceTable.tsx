"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The lamp-lit evidence table.
 *
 * Every object is procedural: paper is a thin box with a canvas-drawn face,
 * bags are physically transmissive, tags are kraft planes. Nothing is
 * downloaded, so the scene works offline and loads instantly.
 *
 * The sequence replays the real headline run: the invoice is bagged as
 * exhibit A, the portal screenshot as B, the ERP ledger card as C, and the
 * case is stamped verified.
 */

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, fonts: Fonts) => void;
interface Fonts {
  sans: string;
  mono: string;
  stencil: string;
}

function readFonts(): Fonts {
  const css = getComputedStyle(document.documentElement);
  const pick = (v: string, fallback: string) => css.getPropertyValue(v).trim() || fallback;
  return {
    sans: pick("--font-schibsted", "system-ui"),
    mono: pick("--font-jetbrains", "monospace"),
    stencil: pick("--font-shoulders-stencil", "Impact"),
  };
}

function makeTexture(w: number, h: number, fonts: Fonts, draw: Draw): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, w, h, fonts);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, base: string) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.8;
  }
  ctx.putImageData(img, 0, 0);
}

function bars(ctx: CanvasRenderingContext2D, x: number, y: number, widths: number[], gap: number, h: number, colour: string) {
  ctx.fillStyle = colour;
  widths.forEach((bw, i) => ctx.fillRect(x, y + i * gap, bw, h));
}

const drawInvoice: Draw = (ctx, w, h, f) => {
  paperGrain(ctx, w, h, "#f4efe4");
  ctx.fillStyle = "#1b1a17";
  ctx.font = `700 46px ${f.sans}`;
  ctx.fillText("Acme Industrial Supply", 56, 96);
  ctx.font = `800 52px ${f.sans}`;
  ctx.textAlign = "right";
  ctx.fillText("INVOICE", w - 56, 96);
  ctx.font = `500 30px ${f.mono}`;
  ctx.fillText("INV-ACM-2012", w - 56, 140);
  ctx.textAlign = "left";
  bars(ctx, 56, 130, [300, 240], 26, 10, "#b9b2a4");
  ctx.fillStyle = "#d7d1c4";
  ctx.fillRect(56, 230, w - 112, 2);
  ctx.font = `600 24px ${f.sans}`;
  ctx.fillStyle = "#6c665b";
  ctx.fillText("PAYMENT DUE", 56, 290);
  ctx.fillStyle = "#1b1a17";
  ctx.font = `700 30px ${f.sans}`;
  ctx.fillText("22 October 2026", 56, 330);
  bars(ctx, 56, 420, [520, 440, 480, 300, 460, 380], 54, 14, "#cbc4b6");
  ctx.fillStyle = "#d7d1c4";
  ctx.fillRect(w * 0.5, 800, w * 0.5 - 56, 2);
  ctx.font = `500 26px ${f.sans}`;
  ctx.fillStyle = "#6c665b";
  ctx.fillText("Subtotal", w * 0.5, 850);
  ctx.textAlign = "right";
  ctx.fillText("$17,012.00", w - 56, 850);
  ctx.textAlign = "left";
  ctx.fillText("Sales tax 8.25%", w * 0.5, 896);
  ctx.textAlign = "right";
  ctx.fillText("$1,403.49", w - 56, 896);
  ctx.textAlign = "left";
  ctx.fillStyle = "#1b1a17";
  ctx.font = `800 32px ${f.sans}`;
  ctx.fillText("TOTAL DUE", w * 0.5, 960);
  ctx.textAlign = "right";
  ctx.fillText("$18,415.49", w - 56, 960);
  // The figure the agent had to find, circled in grease pencil.
  ctx.strokeStyle = "rgba(196, 66, 40, 0.85)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(w - 160, 950, 150, 42, -0.04, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = "left";
};

const drawScreenshot: Draw = (ctx, w, h, f) => {
  paperGrain(ctx, w, h, "#f6f3ec");
  ctx.fillStyle = "#e9edf1";
  ctx.fillRect(28, 28, w - 56, h - 120);
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(28, 28, w - 56, 56);
  ctx.fillStyle = "#f8fafc";
  ctx.font = `700 26px ${f.sans}`;
  ctx.fillText("Vendor Invoice Portal", 52, 66);
  for (let r = 0; r < 5; r++) {
    const y = 120 + r * 62;
    ctx.fillStyle = r === 2 ? "#fde68a" : "#ffffff";
    ctx.fillRect(52, y, w - 104, 48);
    ctx.fillStyle = "#1d4ed8";
    ctx.font = `600 22px ${f.mono}`;
    ctx.fillText(["INV-ACM-1950", "INV-ACM-1988", "INV-ACM-2012", "INV-ACM-2055", "INV-GBX-7741"][r], 70, y + 32);
    bars(ctx, 300, y + 18, [160], 0, 12, "#94a3b8");
    ctx.fillStyle = "#334155";
    ctx.fillText(["2026-06-18", "2026-07-05", "2026-09-22", "2026-08-30", "2026-08-11"][r], w - 250, y + 32);
  }
  ctx.fillStyle = "#4b4538";
  ctx.font = `500 22px ${f.mono}`;
  ctx.fillText("screenshot 04 · step s1", 36, h - 40);
};

const drawLedger: Draw = (ctx, w, h, f) => {
  paperGrain(ctx, w, h, "#fbf8ef");
  ctx.strokeStyle = "rgba(90, 140, 200, 0.45)";
  ctx.lineWidth = 2;
  for (let y = 120; y < h; y += 52) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(210, 60, 60, 0.55)";
  ctx.beginPath();
  ctx.moveTo(90, 0);
  ctx.lineTo(90, h);
  ctx.stroke();
  ctx.fillStyle = "#1b1a17";
  ctx.font = `800 40px ${f.sans}`;
  ctx.fillText("NimbusERP · BILL-0013", 110, 90);
  ctx.font = `500 30px ${f.mono}`;
  const rows = [
    ["supplier", "Acme Industrial Supply"],
    ["invoice", "INV-ACM-2012"],
    ["amount", "18415.49"],
    ["due", "2026-10-22"],
    ["read back", "GET /api/…/bills ✓"],
  ];
  rows.forEach(([k, v], i) => {
    ctx.fillStyle = "#6c665b";
    ctx.fillText(k, 110, 160 + i * 52);
    ctx.fillStyle = "#1b1a17";
    ctx.fillText(v, 330, 160 + i * 52);
  });
};

const drawTag = (label: string): Draw => (ctx, w, h, f) => {
  paperGrain(ctx, w, h, "#c39a63");
  ctx.fillStyle = "#15120e";
  ctx.beginPath();
  ctx.arc(54, h / 2, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2b2115";
  ctx.font = `900 64px ${f.stencil}`;
  ctx.fillText(label, 96, h / 2 + 22);
};

const drawFolderTab: Draw = (ctx, w, h, f) => {
  paperGrain(ctx, w, h, "#dcc58f");
  ctx.fillStyle = "#3d2f1c";
  ctx.font = `900 76px ${f.stencil}`;
  ctx.fillText("CASE 1_XGUF3CW5", 60, 120);
  ctx.font = `500 34px ${f.mono}`;
  ctx.fillText("acme · latest invoice → nimbuserp", 64, 190);
  ctx.strokeStyle = "rgba(61, 47, 28, 0.25)";
  ctx.lineWidth = 3;
  for (let y = 260; y < h; y += 70) {
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(w - 60, y);
    ctx.stroke();
  }
};

const drawSeal: Draw = (ctx, w, h, f) => {
  ctx.clearRect(0, 0, w, h);
  const c = w / 2;
  ctx.strokeStyle = "rgba(48, 150, 98, 0.92)";
  ctx.fillStyle = "rgba(48, 150, 98, 0.92)";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(c, c, c - 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(c, c, c - 80, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `900 110px ${f.stencil}`;
  ctx.textAlign = "center";
  ctx.fillText("VERIFIED", c, c + 38);
  ctx.font = `700 34px ${f.sans}`;
  const ring = "CHECKED INDEPENDENTLY · PRAXIS · ";
  const r = c - 52;
  for (let i = 0; i < ring.length; i++) {
    const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ring[i], 0, 0);
    ctx.restore();
  }
  // Uneven ink.
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 2 + Math.random() * 3);
  }
  ctx.globalCompositeOperation = "source-over";
};

/* -------------------------------------------------------------------------- */

interface Textures {
  invoice: THREE.CanvasTexture;
  screenshot: THREE.CanvasTexture;
  ledger: THREE.CanvasTexture;
  tagA: THREE.CanvasTexture;
  tagB: THREE.CanvasTexture;
  tagC: THREE.CanvasTexture;
  folder: THREE.CanvasTexture;
  seal: THREE.CanvasTexture;
}

function useTextures(): Textures | null {
  const [tex, setTex] = useState<Textures | null>(null);
  useEffect(() => {
    let alive = true;
    document.fonts.ready.then(() => {
      if (!alive) return;
      const f = readFonts();
      setTex({
        invoice: makeTexture(840, 1188, f, drawInvoice),
        screenshot: makeTexture(900, 620, f, drawScreenshot),
        ledger: makeTexture(960, 600, f, drawLedger),
        tagA: makeTexture(400, 140, f, drawTag("EXHIBIT A")),
        tagB: makeTexture(400, 140, f, drawTag("EXHIBIT B")),
        tagC: makeTexture(400, 140, f, drawTag("EXHIBIT C")),
        folder: makeTexture(1600, 1100, f, drawFolderTab),
        seal: makeTexture(512, 512, f, drawSeal),
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return tex;
}

/* -------------------------------------------------------------------------- */

function Sheet({
  map,
  size,
  thickness = 0.008,
}: {
  map: THREE.Texture;
  size: [number, number];
  thickness?: number;
}) {
  const materials = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({ color: "#e9e2d2", roughness: 0.92 });
    const face = new THREE.MeshStandardMaterial({ map, roughness: 0.86 });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The sheet lies flat, so +y is its face.
    return [edge, edge, face, edge, edge, edge];
  }, [map]);
  return (
    <mesh castShadow receiveShadow material={materials}>
      <boxGeometry args={[size[0], thickness, size[1]]} />
    </mesh>
  );
}

function Bag({ size }: { size: [number, number] }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.03, 0]}>
        <boxGeometry args={[size[0] + 0.16, 0.05, size[1] + 0.22]} />
        <meshPhysicalMaterial
          color="#e4ecee"
          transmission={1}
          roughness={0.09}
          thickness={0.12}
          ior={1.32}
          clearcoat={0.4}
          clearcoatRoughness={0.25}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Seal strip across the top of the bag. */}
      <mesh position={[0, 0.058, -(size[1] + 0.22) / 2 + 0.07]}>
        <boxGeometry args={[size[0] + 0.16, 0.006, 0.06]} />
        <meshStandardMaterial color="#d9473a" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Tag({ map }: { map: THREE.Texture }) {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[0.62, 0.006, 0.22]} />
      <meshStandardMaterial attach="material-0" color="#b38b55" roughness={0.9} />
      <meshStandardMaterial attach="material-1" color="#b38b55" roughness={0.9} />
      <meshStandardMaterial attach="material-2" map={map} roughness={0.92} />
      <meshStandardMaterial attach="material-3" color="#b38b55" roughness={0.9} />
      <meshStandardMaterial attach="material-4" color="#b38b55" roughness={0.9} />
      <meshStandardMaterial attach="material-5" color="#b38b55" roughness={0.9} />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */

interface Slot {
  item: React.RefObject<THREE.Group | null>;
  bag: React.RefObject<THREE.Group | null>;
  tag: React.RefObject<THREE.Group | null>;
  rest: { x: number; z: number; rot: number };
  tagRest: { x: number; z: number; rot: number };
}

function Scene({ tex, still }: { tex: Textures; still: boolean }) {
  const rig = useRef<THREE.Group>(null);
  const seal = useRef<THREE.Mesh>(null);
  const sealMat = useRef<THREE.MeshStandardMaterial>(null);

  const a = { item: useRef<THREE.Group>(null), bag: useRef<THREE.Group>(null), tag: useRef<THREE.Group>(null) };
  const b = { item: useRef<THREE.Group>(null), bag: useRef<THREE.Group>(null), tag: useRef<THREE.Group>(null) };
  const c = { item: useRef<THREE.Group>(null), bag: useRef<THREE.Group>(null), tag: useRef<THREE.Group>(null) };

  const slots: Slot[] = useMemo(
    () => [
      { ...a, rest: { x: -0.95, z: 0.1, rot: 0.12 }, tagRest: { x: -1.25, z: 0.92, rot: -0.35 } },
      { ...b, rest: { x: 0.55, z: -0.42, rot: -0.1 }, tagRest: { x: 1.15, z: 0.02, rot: 0.42 } },
      { ...c, rest: { x: 0.62, z: 0.62, rot: 0.06 }, tagRest: { x: 0.05, z: 1.08, rot: -0.12 } },
    ],
    // Refs are stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const place = (g: THREE.Group | null, x: number, y: number, z: number, rot: number) => {
      if (!g) return;
      g.position.set(x, y, z);
      g.rotation.set(0, rot, 0);
    };

    // Final arrangement, used as the still frame and as each tween's target.
    const settle = () => {
      slots.forEach((s, i) => {
        place(s.item.current, s.rest.x, 0.02 + i * 0.002, s.rest.z, s.rest.rot);
        place(s.bag.current, s.rest.x, 0.02 + i * 0.002, s.rest.z, s.rest.rot);
        place(s.tag.current, s.tagRest.x, 0.085, s.tagRest.z, s.tagRest.rot);
      });
      if (seal.current && sealMat.current) {
        seal.current.position.set(-0.15, 0.1, -0.55);
        seal.current.scale.setScalar(1);
        sealMat.current.opacity = 1;
      }
    };

    if (still) {
      settle();
      return;
    }

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.6, defaults: { ease: "expo.out" } });

    tl.call(() => {
      slots.forEach((s) => {
        place(s.item.current, s.rest.x * 1.5, 2.8, s.rest.z - 1.2, s.rest.rot + 0.9);
        place(s.bag.current, s.rest.x, 2.4, s.rest.z, s.rest.rot);
        place(s.tag.current, s.tagRest.x, 2.2, s.tagRest.z, s.tagRest.rot + 1.4);
      });
      if (seal.current && sealMat.current) {
        seal.current.position.set(-0.15, 0.9, -0.55);
        seal.current.scale.setScalar(1.6);
        sealMat.current.opacity = 0;
      }
    });

    slots.forEach((s, i) => {
      const at = 0.25 + i * 1.25;
      const item = s.item.current!;
      const bag = s.bag.current!;
      const tag = s.tag.current!;
      tl.to(item.position, { x: s.rest.x, y: 0.02 + i * 0.002, z: s.rest.z, duration: 1.1 }, at)
        .to(item.rotation, { y: s.rest.rot, duration: 1.1 }, at)
        .to(bag.position, { y: 0.02 + i * 0.002, duration: 0.7, ease: "power3.inOut" }, at + 0.55)
        .to(tag.position, { y: 0.085, duration: 0.8, ease: "bounce.out" }, at + 0.9)
        .to(tag.rotation, { y: s.tagRest.rot, duration: 0.8 }, at + 0.9);
    });

    const stampAt = 0.25 + slots.length * 1.25 + 0.2;
    tl.to(seal.current!.position, { y: 0.1, duration: 0.28, ease: "power4.in" }, stampAt)
      .to(seal.current!.scale, { x: 1, y: 1, z: 1, duration: 0.28, ease: "power4.in" }, stampAt)
      .to(sealMat.current!, { opacity: 1, duration: 0.12 }, stampAt + 0.2)
      .to(rig.current!.position, { y: -0.02, duration: 0.08, yoyo: true, repeat: 1, ease: "none" }, stampAt + 0.28)
      .to({}, { duration: 2.6 });

    return () => {
      tl.kill();
    };
  }, [slots, still]);

  useFrame(({ camera, clock }) => {
    if (still) return;
    const t = clock.getElapsedTime();
    camera.position.x = Math.sin(t * 0.12) * 0.55;
    camera.position.z = 4.4 + Math.cos(t * 0.12) * 0.18;
    camera.lookAt(0, 0, 0.05);
  });

  return (
    <group ref={rig}>
      {/* Bench */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.01, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#2a2118" roughness={0.78} metalness={0.02} />
      </mesh>

      {/* Case folder */}
      <group position={[0, 0, 0.12]} rotation-y={-0.04}>
        <Sheet map={tex.folder} size={[3.6, 2.5]} thickness={0.012} />
      </group>

      <group ref={a.item}>
        <Sheet map={tex.invoice} size={[0.84, 1.19]} />
      </group>
      <group ref={a.bag}>
        <Bag size={[0.84, 1.19]} />
      </group>
      <group ref={a.tag}>
        <Tag map={tex.tagA} />
      </group>

      <group ref={b.item}>
        <Sheet map={tex.screenshot} size={[1.05, 0.72]} />
      </group>
      <group ref={b.bag}>
        <Bag size={[1.05, 0.72]} />
      </group>
      <group ref={b.tag}>
        <Tag map={tex.tagB} />
      </group>

      <group ref={c.item}>
        <Sheet map={tex.ledger} size={[1.1, 0.69]} />
      </group>
      <group ref={c.bag}>
        <Bag size={[1.1, 0.69]} />
      </group>
      <group ref={c.tag}>
        <Tag map={tex.tagC} />
      </group>

      <mesh ref={seal} rotation-x={-Math.PI / 2} rotation-z={0.2}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshStandardMaterial
          ref={sealMat}
          map={tex.seal}
          transparent
          opacity={0}
          roughness={0.5}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-4}
        />
      </mesh>

      <ContactShadows position={[0, 0.001, 0]} opacity={0.6} scale={8} blur={2.6} far={1.4} color="#000000" />
    </group>
  );
}

export default function EvidenceTable({ className }: { className?: string }) {
  const tex = useTextures();
  const [still, setStill] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setStill(mq.matches);
    const onChange = () => setStill(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className={className} aria-hidden>
      <Canvas
        shadows="soft"
        dpr={[1, 1.75]}
        camera={{ position: [0, 4.1, 4.4], fov: 30 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <color attach="background" args={["#15120e"]} />
        <fog attach="fog" args={["#15120e", 6.5, 13]} />
        <ambientLight intensity={0.16} color="#ffe9c9" />
        <spotLight
          position={[0.7, 6.2, 1.6]}
          angle={0.5}
          penumbra={0.95}
          intensity={140}
          decay={2}
          color="#ffdcae"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
        />
        <pointLight position={[-3, 1.4, 2.5]} intensity={3} color="#8fb3c9" />
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={2.2} color="#ffd9a6" position={[0, 5, 1]} rotation-x={Math.PI / 2} scale={[4, 2, 1]} />
          <Lightformer form="rect" intensity={0.6} color="#9fc0d6" position={[-4, 2, 2]} rotation-y={Math.PI / 2} scale={[3, 1, 1]} />
        </Environment>
        {tex ? <Scene tex={tex} still={still} /> : null}
        <EffectComposer multisampling={0}>
          <Noise opacity={0.045} premultiply />
          <Vignette offset={0.28} darkness={0.78} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
