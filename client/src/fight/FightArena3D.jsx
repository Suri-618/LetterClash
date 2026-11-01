import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import Fighter3D from "./Fighter3D.jsx";
import { getFighter } from "./fighterConfig.js";
import "./FightArena3D.css";

function makeTextTexture(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(4, 10, 7, 0.9)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = color;
  context.lineWidth = 10;
  context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  context.fillStyle = color;
  context.font = "900 142px Impact, Arial Narrow, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeHazardTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");

  context.fillStyle = "#e4cf7b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#15150e";

  for (let x = -64; x < canvas.width + 64; x += 64) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 32, 0);
    context.lineTo(x + 64, canvas.height);
    context.lineTo(x + 32, canvas.height);
    context.closePath();
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 1);
  return texture;
}

function CameraRig({ shakeKey, reducedMotion, finished }) {
  const { camera, size } = useThree();
  const shakeRef = useRef(-10);

  useEffect(() => {
    shakeRef.current = performance.now() / 1000;
  }, [shakeKey]);

  useFrame(() => {
    const now = performance.now() / 1000;
    const baseZoom = Math.max(86, Math.min(152, size.width / 7.8));
    const koZoom = finished && !reducedMotion ? 1.055 : 1;
    const elapsed = now - shakeRef.current;
    const shake = !reducedMotion && elapsed < 0.28
      ? Math.exp(-elapsed * 13) * 0.055
      : 0;

    camera.position.set(
      Math.sin(now * 91) * shake,
      2.12 + Math.cos(now * 77) * shake,
      7.6
    );
    camera.zoom = baseZoom * koZoom;
    camera.lookAt(0, 1.06, 0);
    camera.updateProjectionMatrix();
  });

  return null;
}

function PaintedBackdrop() {
  const materialRef = useRef(null);

  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color("#1c3b31") },
      uBottom: { value: new THREE.Color("#08100b") },
      uGlow: { value: new THREE.Color("#c99e3f") },
      uRust: { value: new THREE.Color("#773522") },
    }),
    []
  );

  return (
    <mesh position={[0, 2.3, -3.35]} receiveShadow={false}>
      <planeGeometry args={[15, 8.2]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        depthWrite={false}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform vec3 uTop;
          uniform vec3 uBottom;
          uniform vec3 uGlow;
          uniform vec3 uRust;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }

          void main() {
            vec2 uv = vUv;
            float horizon = smoothstep(0.0, 0.86, uv.y);
            vec3 color = mix(uBottom, uTop, horizon);

            float sun = 1.0 - smoothstep(0.0, 0.24, distance(uv, vec2(0.5, 0.6)));
            color += uGlow * sun * 0.28;

            float rust = smoothstep(0.72, 1.0, noise(uv * 8.0));
            color = mix(color, uRust, rust * 0.16);

            float scan = sin(uv.y * 430.0) * 0.012;
            float band = smoothstep(0.965, 1.0, sin((uv.y + uv.x * 0.12) * 58.0));
            color -= band * 0.025;
            color += scan;

            float vignette = smoothstep(0.0, 0.72, distance(uv, vec2(0.5, 0.55)));
            color *= 1.0 - vignette * 0.32;

            gl_FragColor = vec4(color, 1.0);
          }
        `}
      />
    </mesh>
  );
}

function BackSigns() {
  const titleTexture = useMemo(
    () => makeTextTexture("LETTER CLASH", "#e4cf7b"),
    []
  );
  const roundTexture = useMemo(
    () => makeTextTexture("FINAL WORD", "#d96b4d"),
    []
  );

  return (
    <group position={[0, 0, -3.22]}>
      <mesh position={[0, 3.02, 0]}>
        <planeGeometry args={[3.5, 0.86]} />
        <meshBasicMaterial map={titleTexture} toneMapped={false} />
      </mesh>

      <mesh position={[-3.35, 2.15, 0]} rotation={[0, 0.06, 0]}>
        <planeGeometry args={[1.7, 0.46]} />
        <meshBasicMaterial map={roundTexture} toneMapped={false} opacity={0.88} transparent />
      </mesh>

      <mesh position={[3.35, 2.15, 0]} rotation={[0, -0.06, 0]}>
        <planeGeometry args={[1.7, 0.46]} />
        <meshBasicMaterial map={roundTexture} toneMapped={false} opacity={0.88} transparent />
      </mesh>
    </group>
  );
}

function Arena() {
  const hazardTexture = useMemo(() => makeHazardTexture(), []);

  return (
    <group>
      <PaintedBackdrop />
      <BackSigns />

      <mesh position={[0, -0.1, -0.15]} receiveShadow>
        <boxGeometry args={[8.6, 0.18, 3.8]} />
        <meshStandardMaterial
          color="#173328"
          roughness={0.95}
          metalness={0.02}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, -0.005, 0.55]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.7, 2.4]} />
        <meshStandardMaterial
          color="#264437"
          roughness={1}
          metalness={0}
          toneMapped={false}
        />
      </mesh>

      <gridHelper
        args={[9, 18, "#6f5a2a", "#294236"]}
        position={[0, 0.005, 0.2]}
      />

      <mesh position={[0, 0.02, 1.72]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.6, 0.24]} />
        <meshBasicMaterial map={hazardTexture} toneMapped={false} />
      </mesh>

      <mesh position={[0, 0.02, -1.78]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.6, 0.18]} />
        <meshBasicMaterial map={hazardTexture} toneMapped={false} opacity={0.72} />
      </mesh>

      <mesh position={[-3.48, 0.46, 0.1]} rotation={[0, 0.08, 0]}>
        <boxGeometry args={[0.16, 1.08, 3.5]} />
        <meshBasicMaterial color="#8e4a2d" toneMapped={false} />
      </mesh>
      <mesh position={[3.48, 0.46, 0.1]} rotation={[0, -0.08, 0]}>
        <boxGeometry args={[0.16, 1.08, 3.5]} />
        <meshBasicMaterial color="#c1a04f" toneMapped={false} />
      </mesh>

      <group position={[0, 3.82, -2.9]}>
        <mesh>
          <boxGeometry args={[7.4, 0.12, 0.12]} />
          <meshBasicMaterial color="#c1a04f" toneMapped={false} />
        </mesh>
        {[-3, -1.8, -0.6, 0.6, 1.8, 3].map((x) => (
          <mesh key={x} position={[x, -0.22, 0]}>
            <sphereGeometry args={[0.1, 12, 8]} />
            <meshBasicMaterial color="#f4c860" toneMapped={false} />
          </mesh>
        ))}
      </group>

      <pointLight position={[-2.8, 2.4, 1.8]} color="#41b8a3" intensity={9} distance={6} />
      <pointLight position={[2.8, 2.4, 1.8]} color="#c68cff" intensity={8} distance={6} />
      <spotLight
        position={[0, 6.2, 3.5]}
        angle={0.62}
        penumbra={0.85}
        intensity={28}
        color="#ffe0a3"
        distance={13}
      />
    </group>
  );
}

function FighterPair({
  left,
  right,
  combatEffect,
  finished,
  winnerId,
  reducedMotion,
}) {
  const leftPose = finished
    ? winnerId === left?.id
      ? "victory"
      : "ko"
    : combatEffect?.defenderId === left?.id
      ? "hit"
      : combatEffect?.attackerId === left?.id
        ? "punch"
        : "idle";

  const rightPose = finished
    ? winnerId === right?.id
      ? "victory"
      : "ko"
    : combatEffect?.defenderId === right?.id
      ? "hit"
      : combatEffect?.attackerId === right?.id
        ? "punch"
        : "idle";

  const triggerId = combatEffect?.id || (finished ? `finish-${winnerId}` : 0);

  return (
    <>
      {left && (
        <Fighter3D
          fighterId={left.fighter}
          side="left"
          pose={leftPose}
          triggerId={triggerId}
          isAttacking={!finished && combatEffect?.attackerId === left.id}
          isHit={!finished && combatEffect?.defenderId === left.id}
          reducedMotion={reducedMotion}
        />
      )}
      {right && (
        <Fighter3D
          fighterId={right.fighter}
          side="right"
          pose={rightPose}
          triggerId={triggerId}
          isAttacking={!finished && combatEffect?.attackerId === right.id}
          isHit={!finished && combatEffect?.defenderId === right.id}
          reducedMotion={reducedMotion}
        />
      )}
    </>
  );
}

function ArenaFloorLights({ left, right }) {
  const leftFighter = getFighter(left?.fighter);
  const rightFighter = getFighter(right?.fighter);

  return (
    <>
      <pointLight position={[-1.85, 0.4, 1.2]} color={leftFighter.color} intensity={3.2} distance={3.4} />
      <pointLight position={[1.85, 0.4, 1.2]} color={rightFighter.color} intensity={3.2} distance={3.4} />
      <ambientLight intensity={1.15} color="#d8e6cc" />
      <directionalLight position={[-3.5, 6, 4.5]} intensity={2.8} color="#ffe2a8" />
      <directionalLight position={[4.2, 3.5, 2]} intensity={1.5} color="#88bfb0" />
    </>
  );
}

export default function FightArena3D({
  left,
  right,
  combatEffect,
  phase,
  winnerId,
  reducedMotion = false,
}) {
  const finished = phase === "finished";

  return (
    <div className="fs-arena-3d" aria-hidden="true">
      <Canvas
        flat
        dpr={[1, 1.7]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.NoToneMapping,
        }}
        style={{ pointerEvents: "none" }}
      >
        <color attach="background" args={["#08100b"]} />
        <fog attach="fog" args={["#08100b", 8.4, 16]} />
        <OrthographicCamera makeDefault position={[0, 2.12, 7.6]} near={0.1} far={40} />
        <CameraRig
          shakeKey={combatEffect?.id || 0}
          reducedMotion={reducedMotion}
          finished={finished}
        />
        <Suspense fallback={null}>
          <Arena />
          <ArenaFloorLights left={left} right={right} />
          <FighterPair
            left={left}
            right={right}
            combatEffect={combatEffect}
            finished={finished}
            winnerId={winnerId}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
