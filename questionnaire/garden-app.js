/**
 * True 3D garden - React Three Fiber + custom pan camera + fog + sprites.
 */
import React, {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

const STORAGE_KEY = 'amuletQuestionnaire';
const FOG_COLOR = '#F4F4E8';
const FOG_DENSITY = 0.045;
const CAMERA_Y = 12;
const CAMERA_Z = 16;
const PAN_SPEED = 0.05;
const FIGMA_W = 1920;
const FIGMA_H = 1080;
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();

/** Figma 1425:1074 - exact bounding boxes */
const AMULET_FIGMA = [
  { tex: 0, x: 28.0771484375, y: 506.9833984375, w: 398.0166015625, h: 398.0166015625 },
  { tex: 1, x: 380.8310546875, y: 365.0234375, w: 225.443359375, h: 225.443359375 },
  { tex: 2, x: 977.18017578125, y: 350.1875, w: 188.8125, h: 188.8125 },
  { tex: 3, x: 945.90625, y: 381.30322265625, w: 251.3603515625, h: 251.3603515625 },
  { tex: 4, x: 1169.4638671875, y: 346.6214599609375, w: 658.4755859375, h: 658.4755859375 },
  { tex: 5, x: 460, y: 502.2083740234375, w: 783, h: 783 },
  { tex: 6, x: -245.76953125, y: 601.642578125, w: 603.12890625, h: 603.12890625 },
];

function snapshotCamera(camera) {
  const snap = camera.clone();
  snap.position.set(0, CAMERA_Y, CAMERA_Z);
  snap.lookAt(0, 0, CAMERA_Z - 10);
  snap.updateProjectionMatrix();
  snap.updateMatrixWorld(true);
  return snap;
}

function figmaPointToWorld(cx, cy, camera, size) {
  const sx = (cx / FIGMA_W) * size.width;
  const sy = (cy / FIGMA_H) * size.height;
  _ndc.x = (sx / size.width) * 2 - 1;
  _ndc.y = -(sy / size.height) * 2 + 1;
  _ray.setFromCamera(_ndc, camera);
  const point = _ray.ray.intersectPlane(GROUND_PLANE, _hit);
  return point ? point.clone() : new THREE.Vector3();
}

function figmaWidthToWorldScale(figmaW, worldPos, camera, size) {
  const dist = camera.position.distanceTo(worldPos);
  const viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
  return figmaW / (size.height / viewH);
}

function figmaToLayout(figma, camera, size) {
  const cx = figma.x + figma.w / 2;
  const cy = figma.y + figma.h / 2;
  const pos = figmaPointToWorld(cx, cy, camera, size);
  pos.y = 0;
  return {
    tex: figma.tex,
    x: pos.x,
    z: pos.z,
    scale: figmaWidthToWorldScale(figma.w, pos, camera, size),
  };
}

function texUrl(i) {
  return '/public/amulets/amulet-' + i + '.png';
}

function loadAnswers() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function answeredSet(answers, questions) {
  const set = new Set();
  questions.forEach((q, i) => {
    const v = answers[q.key];
    if (v !== undefined && v !== null && String(v).trim() !== '') set.add(i);
  });
  return set;
}

function nextUnansweredIndex(answers, questions) {
  for (let i = 0; i < questions.length; i++) {
    const v = answers[questions[i].key];
    if (v === undefined || v === null || String(v).trim() === '') return i;
  }
  return 0;
}

function lookForward(camera) {
  camera.position.y = CAMERA_Y;
  camera.lookAt(camera.position.x, 0, camera.position.z - 10);
}

function CameraPan({ enabled }) {
  const { camera, gl } = useThree();
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    lookForward(camera);
  }, [camera]);

  useFrame(() => {
    camera.position.y = CAMERA_Y;
  });

  useEffect(() => {
    const el = gl.domElement;

    const onPointerDown = (e) => {
      if (!enabled || e.button !== 0) return;
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'grabbing';
    };

    const onPointerMove = (e) => {
      if (!enabled || !isDragging.current) return;
      const deltaX = e.clientX - lastMouse.current.x;
      const deltaY = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      camera.position.x -= deltaX * PAN_SPEED;
      camera.position.z -= deltaY * PAN_SPEED;
      lookForward(camera);
    };

    const onPointerUp = (e) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      document.body.style.cursor = 'grab';
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, [enabled, camera, gl]);

  return null;
}

function useInitialFigmaLayouts() {
  const { camera, size } = useThree();
  const [layouts, setLayouts] = useState([]);

  useLayoutEffect(() => {
    if (!size.width || !size.height) return;
    const snap = snapshotCamera(camera);
    setLayouts(AMULET_FIGMA.map((figma) => figmaToLayout(figma, snap, size)));
  }, [camera, size.width, size.height]);

  return layouts;
}

function AmuletSprite({ layout, questionIndex, focusIndex, onSelect }) {
  const texture = useTexture(texUrl(layout.tex));
  const isFocus = questionIndex === focusIndex;
  const scale = useMemo(() => {
    const img = texture.image;
    const aspect = img && img.width ? img.height / img.width : 1;
    const s = layout.scale;
    return new THREE.Vector3(s, s * aspect, 1);
  }, [texture, layout.scale]);

  const handleClick = useCallback(
    (e) => {
      e.stopPropagation();
      onSelect(questionIndex, e);
    },
    [onSelect, questionIndex]
  );

  return React.createElement(
    'sprite',
    {
      position: [layout.x, 0, layout.z],
      scale,
      onClick: handleClick,
      onPointerOver: () => {
        document.body.style.cursor = 'pointer';
      },
      onPointerOut: () => {
        document.body.style.cursor = 'grab';
      },
    },
    React.createElement('spriteMaterial', {
      map: texture,
      transparent: true,
      alphaTest: 0.05,
      depthWrite: false,
      fog: true,
      opacity: isFocus ? 1 : 0.82,
      toneMapped: false,
    })
  );
}

function GardenScene({ activeIndices, focusIndex, controlsEnabled, onSelect }) {
  const layouts = useInitialFigmaLayouts();

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('color', { attach: 'background', args: [FOG_COLOR] }),
    React.createElement('fogExp2', { attach: 'fog', args: [FOG_COLOR, FOG_DENSITY] }),
    React.createElement('ambientLight', { intensity: 0.8 }),
    React.createElement(CameraPan, { enabled: controlsEnabled }),
    layouts.length > 0 &&
      activeIndices.map((questionIndex) => {
        const layout = layouts[questionIndex % layouts.length];
        if (!layout) return null;
        return React.createElement(AmuletSprite, {
          key: questionIndex,
          layout,
          questionIndex,
          focusIndex,
          onSelect,
        });
      })
  );
}

function GardenApp() {
  const questions = window.AMULET_QUESTIONS || [];
  const stageRef = useRef(null);
  const [answersVersion, setAnswersVersion] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [controlsEnabled, setControlsEnabled] = useState(true);

  const answers = useMemo(() => loadAnswers(), [answersVersion]);
  const done = useMemo(() => answeredSet(answers, questions), [answers, questions]);

  const activeIndices = useMemo(
    () => questions.map((_, i) => i),
    [questions]
  );

  useEffect(() => {
    setFocusIndex(nextUnansweredIndex(answers, questions));
  }, [answers, questions, answersVersion]);

  const handleSelect = useCallback((index, event) => {
    if (document.body.classList.contains('is-panel-open')) {
      window.dispatchEvent(new CustomEvent('questionnaire:close-panel'));
      return;
    }
    setFocusIndex(index);

    const pagmar = stageRef.current?.closest('.pagmar-canvas');
    const rect = pagmar?.getBoundingClientRect();
    const native = event.nativeEvent || event;
    const anchor = rect
      ? { x: native.clientX - rect.left, y: native.clientY - rect.top }
      : { x: 0, y: 0 };

    window.dispatchEvent(
      new CustomEvent('questionnaire:star-click', {
        detail: { anchor, index },
      })
    );
  }, []);

  useEffect(() => {
    const onAnswered = () => setAnswersVersion((v) => v + 1);
    const onOpen = () => setControlsEnabled(false);
    const onClose = () => setControlsEnabled(true);

    window.addEventListener('questionnaire:answered', onAnswered);
    window.addEventListener('questionnaire:panel-open', onOpen);
    window.addEventListener('questionnaire:panel-close', onClose);
    return () => {
      window.removeEventListener('questionnaire:answered', onAnswered);
      window.removeEventListener('questionnaire:panel-open', onOpen);
      window.removeEventListener('questionnaire:panel-close', onClose);
    };
  }, []);

  useEffect(() => {
    window.questionnaireStar = {
      getAnchorCanvasPoint() {
        return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
      },
      pauseFloat() {
        setControlsEnabled(false);
      },
      resumeFloat() {
        setControlsEnabled(true);
      },
      placeAtCenter() {},
    };
  }, []);

  return React.createElement(
    'div',
    {
      ref: stageRef,
      style: { width: '100%', height: '100%', touchAction: 'none', cursor: 'grab' },
    },
    React.createElement(
      Canvas,
      {
        camera: { position: [0, CAMERA_Y, CAMERA_Z], fov: 50, near: 0.1, far: 120 },
        onCreated: ({ camera }) => lookForward(camera),
        gl: { antialias: true, alpha: false },
        dpr: [1, 2],
        style: { width: '100%', height: '100%', display: 'block', background: FOG_COLOR },
      },
      React.createElement(
        Suspense,
        { fallback: null },
        React.createElement(GardenScene, {
          activeIndices,
          focusIndex,
          controlsEnabled,
          onSelect: handleSelect,
        })
      )
    )
  );
}

const mount = document.getElementById('questionGarden');
if (mount) {
  createRoot(mount).render(React.createElement(GardenApp));
  window.addEventListener('error', (e) => {
    console.error('[garden] failed to load:', e.message, e.filename);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[garden] module error:', e.reason);
  });
}
