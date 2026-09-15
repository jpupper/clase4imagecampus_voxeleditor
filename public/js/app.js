import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Conexión en tiempo real con Socket.IO
const socket = typeof io !== 'undefined' ? io() : null;

/* ==========================================================================
   ESTADO GLOBAL DE LA APLICACIÓN
   ========================================================================== */
const state = {
  currentTool: 'place', // 'place' | 'erase' | 'orbit'
  currentColor: '#4CAF50',
  showGrid: true,
  showEdges: true,
  soundEnabled: true,
  cubes: [], // Lista de todos los meshes de cubos en la escena
  cubeMap: new Map(), // Clave "x,y,z" -> Mesh para evitar duplicados
  presets: [] // Presets indexados desde el servidor
};

/* ==========================================================================
   SISTEMA DE AUDIO SINTÉTICO (Sin archivos externos)
   ========================================================================== */
let audioCtx = null;
function playSound(type) {
  if (!state.soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'place') {
      // Sonido de colocar bloque (tipo golpe de madera/piedra)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'erase') {
      // Sonido de romper bloque (pop agudo)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'click') {
      // Sonido UI
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.04);
    }
  } catch (e) {
    // Ignorar si el navegador bloquea audio antes de interacción
  }
}

/* ==========================================================================
   CONFIGURACIÓN DE THREE.JS (ESCENA, CÁMARA, LUCES, RENDERER)
   ========================================================================== */
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d14);

// Niebla sutil para profundidad estética
scene.fog = new THREE.FogExp2(0x0a0d14, 0.015);

// Cámara Perspectiva
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const DEFAULT_CAM_POS = new THREE.Vector3(14, 12, 16);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 1.5, 0);
camera.position.copy(DEFAULT_CAM_POS);

// WebGL Renderer con soporte de sombras y captura de buffer
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// OrbitControls (Navegación 3D)
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(DEFAULT_CAM_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxDistance = 120;
controls.minDistance = 3;
controls.maxPolarAngle = Math.PI / 2 - 0.01; // No traspasar el suelo por debajo

// Configuración de botones de mouse para OrbitControls:
// - Botón Derecho: Siempre rota la cámara
// - Rueda: Siempre zoom
// - Botón Izquierdo: Rota SOLO si la herramienta activa es 'orbit'
function updateControlsMapping() {
  if (state.currentTool === 'orbit') {
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };
    container.style.cursor = 'grab';
  } else if (state.currentTool === 'erase') {
    controls.mouseButtons = {
      LEFT: -1, // Reservado para borrar cubos
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };
    container.style.cursor = 'pointer';
  } else {
    // 'place'
    controls.mouseButtons = {
      LEFT: -1, // Reservado para colocar cubos
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };
    container.style.cursor = 'crosshair';
  }
}
updateControlsMapping();

/* ==========================================================================
   ILUMINACIÓN DE ALTA CALIDAD
   ========================================================================== */
// Luz ambiental suave
const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

// Luz direccional principal (tipo Sol Minecraft)
const dirLight = new THREE.DirectionalLight(0xfffaed, 0.9);
dirLight.position.set(20, 35, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 80;
const d = 25;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// Luz de relleno secundaria (celeste suave)
const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.3);
fillLight.position.set(-15, 20, -15);
scene.add(fillLight);

/* ==========================================================================
   SUELO Y CUADRÍCULA (GRID SNAPPING)
   ========================================================================== */
const GRID_SIZE = 40;
const GRID_DIVISIONS = 40;

// Grid visual
const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x38bdf8, 0x1e293b);
gridHelper.position.y = 0;
scene.add(gridHelper);

// Plano de suelo para intersecciones de Raycasting y recepción de sombras
const groundGeo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x0f172a,
  roughness: 0.9,
  metalness: 0.1,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});
const groundPlane = new THREE.Mesh(groundGeo, groundMat);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.receiveShadow = true;
scene.add(groundPlane);

/* ==========================================================================
   GEOMETRÍAS Y CURSOR / GHOST BLOCK (ROLL-OVER BOX)
   ========================================================================== */
const BOX_SIZE = 1;
const boxGeometry = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);

// Material para el cubo fantasma / cursor
const rollOverMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(state.currentColor),
  transparent: true,
  opacity: 0.55,
  roughness: 0.2,
  metalness: 0.1
});
const rollOverMesh = new THREE.Mesh(boxGeometry, rollOverMaterial);

// Bordes del cubo fantasma
const rollOverEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(boxGeometry),
  new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
);
rollOverMesh.add(rollOverEdges);
scene.add(rollOverMesh);

// Variable para saber qué cubo está bajo el cursor en modo borrador
let hoveredCube = null;

/* ==========================================================================
   SISTEMA DE RAYCASTING Y GESTIÓN DE VOXELS
   ========================================================================== */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-999, -999);
const pointerDownPos = new THREE.Vector2();
let isPointerDown = false;

function getKey(x, y, z) {
  return `${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`;
}

// Crea la malla de un cubo voxel
function createCubeMesh(x, y, z, hexColor) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hexColor),
    roughness: 0.5,
    metalness: 0.1
  });

  const mesh = new THREE.Mesh(boxGeometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { color: hexColor, isVoxel: true };

  // Bordes estilizados tipo voxel
  if (state.showEdges) {
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3
    });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeometry), edgesMat);
    edges.name = 'voxel-edges';
    mesh.add(edges);
  }

  return mesh;
}

// Colocar un nuevo cubo
function placeCube(x, y, z, hexColor, fromRemote = false) {
  const key = getKey(x, y, z);
  if (state.cubeMap.has(key)) return; // Ya existe en esa posición

  const cube = createCubeMesh(x, y, z, hexColor);
  scene.add(cube);
  state.cubes.push(cube);
  state.cubeMap.set(key, cube);

  updateCubeCounter();
  playSound('place');

  // Sincronizar con los demás clientes si fue colocado por este usuario
  if (!fromRemote && socket) {
    socket.emit('place-cube', { x, y, z, color: hexColor });
  }
}

// Borrar un cubo existente
function eraseCube(cubeMesh, fromRemote = false) {
  if (!cubeMesh || !cubeMesh.userData.isVoxel) return;

  const key = getKey(cubeMesh.position.x, cubeMesh.position.y, cubeMesh.position.z);
  const pos = { x: cubeMesh.position.x, y: cubeMesh.position.y, z: cubeMesh.position.z };
  state.cubeMap.delete(key);

  const idx = state.cubes.indexOf(cubeMesh);
  if (idx !== -1) state.cubes.splice(idx, 1);

  scene.remove(cubeMesh);
  if (cubeMesh.geometry) cubeMesh.geometry.dispose();
  if (cubeMesh.material) cubeMesh.material.dispose();

  updateCubeCounter();
  playSound('erase');

  // Sincronizar con los demás clientes si fue borrado por este usuario
  if (!fromRemote && socket) {
    socket.emit('erase-cube', pos);
  }
}

// Borrar un cubo por coordenadas (para eventos remotos)
function eraseCubeAt(x, y, z) {
  const key = getKey(x, y, z);
  const cube = state.cubeMap.get(key);
  if (cube) {
    eraseCube(cube, true);
  }
}

// Limpiar toda la escena
function clearScene(fromRemote = false) {
  state.cubes.forEach(cube => {
    scene.remove(cube);
    if (cube.geometry) cube.geometry.dispose();
    if (cube.material) cube.material.dispose();
  });
  state.cubes = [];
  state.cubeMap.clear();
  hoveredCube = null;
  updateCubeCounter();

  if (!fromRemote) {
    showToast('Lienzo limpio y listo', 'info');
    if (socket) socket.emit('clear-world');
  }
}

// Cargar conjunto de cubos en la escena
function loadCubes(cubesData, fromRemote = false, presetName = '') {
  clearScene(true);
  cubesData.forEach(c => {
    placeCube(c.x, c.y, c.z, c.color, true);
  });
  centerCameraOnModel();

  if (!fromRemote && socket) {
    socket.emit('load-world', { cubes: cubesData, presetName: presetName });
  }
}

// Centrar y ajustar la cámara al modelo actual
function centerCameraOnModel() {
  if (state.cubes.length === 0) {
    controls.target.copy(DEFAULT_CAM_TARGET);
    camera.position.copy(DEFAULT_CAM_POS);
    return;
  }

  const box = new THREE.Box3();
  state.cubes.forEach(c => box.expandByObject(c));

  const center = new THREE.Vector3();
  box.getCenter(center);
  controls.target.copy(center);

  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = Math.max(maxDim * 2.2, 12);

  camera.position.set(center.x + dist * 0.7, center.y + dist * 0.6, center.z + dist * 0.7);
  controls.update();
}

// Actualizar contador del header
function updateCubeCounter() {
  const el = document.getElementById('cube-count');
  if (el) el.innerText = state.cubes.length;
}

/* ==========================================================================
   ACTUALIZACIÓN DEL ROLL-OVER / CURSOR EN TIEMPO REAL
   ========================================================================== */
function updateRollOver() {
  if (state.currentTool === 'orbit') {
    rollOverMesh.visible = false;
    hoveredCube = null;
    return;
  }

  raycaster.setFromCamera(mouse, camera);

  // Objetos intersectables: plano de suelo + todos los cubos
  const interactables = [groundPlane, ...state.cubes];
  const intersects = raycaster.intersectObjects(interactables, false);

  if (intersects.length > 0) {
    const intersect = intersects[0];
    const isGround = intersect.object === groundPlane;

    if (state.currentTool === 'place') {
      rollOverMesh.visible = true;
      rollOverMaterial.color.set(state.currentColor);
      rollOverEdges.material.color.set(0xffffff);

      let targetPos;
      if (isGround) {
        // Snapping al centro de la celda de la cuadrícula sobre el suelo (y = 0.5)
        targetPos = new THREE.Vector3(
          Math.floor(intersect.point.x) + 0.5,
          0.5,
          Math.floor(intersect.point.z) + 0.5
        );
      } else {
        // Snapping relativo a la normal de la cara del cubo impactado
        const normal = intersect.face.normal;
        targetPos = new THREE.Vector3()
          .copy(intersect.object.position)
          .add(normal);
      }

      rollOverMesh.position.copy(targetPos);
      hoveredCube = null;

    } else if (state.currentTool === 'erase') {
      if (isGround) {
        // En el suelo no hay nada que borrar
        rollOverMesh.visible = false;
        hoveredCube = null;
      } else {
        // Destacar el cubo que se va a borrar con rojo brillante
        rollOverMesh.visible = true;
        rollOverMaterial.color.set(0xef4444);
        rollOverEdges.material.color.set(0xff0000);
        rollOverMesh.position.copy(intersect.object.position);
        hoveredCube = intersect.object;
      }
    }
  } else {
    rollOverMesh.visible = false;
    hoveredCube = null;
  }
}

/* ==========================================================================
   GESTIÓN DE EVENTOS DE MOUSE & POINTER
   ========================================================================== */
window.addEventListener('pointermove', (e) => {
  // Coordenadas normalizadas (-1 a +1)
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  updateRollOver();
});

container.addEventListener('pointerdown', (e) => {
  if (e.button === 0) { // Clic izquierdo
    isPointerDown = true;
    pointerDownPos.set(e.clientX, e.clientY);
  }
});

container.addEventListener('pointerup', (e) => {
  if (e.button === 0 && isPointerDown) {
    isPointerDown = false;
    const dist = pointerDownPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY));

    // Si hubo un arrastre significativo, es paneo/rotación y no un clic de colocación
    if (dist > 5) return;

    // Ejecutar acción de la herramienta activa
    if (state.currentTool === 'place' && rollOverMesh.visible) {
      placeCube(
        rollOverMesh.position.x,
        rollOverMesh.position.y,
        rollOverMesh.position.z,
        state.currentColor
      );
      updateRollOver();
    } else if (state.currentTool === 'erase' && hoveredCube) {
      eraseCube(hoveredCube);
      updateRollOver();
    }
  }
});

// Menú contextual nativo deshabilitado en el canvas para rotación libre con clic derecho
container.addEventListener('contextmenu', (e) => e.preventDefault());

// Ajuste responsivo de ventana
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ==========================================================================
   HERRAMIENTAS, PALETA Y BOTONES DE LA UI
   ========================================================================== */

// Botones de Modo / Pinceles
const toolButtons = {
  place: document.getElementById('tool-place'),
  erase: document.getElementById('tool-erase'),
  orbit: document.getElementById('tool-orbit')
};

const hintActionText = document.getElementById('hint-action-text');

function setActiveTool(tool) {
  state.currentTool = tool;
  Object.keys(toolButtons).forEach(k => {
    toolButtons[k].classList.toggle('active', k === tool);
  });
  updateControlsMapping();
  updateRollOver();

  if (tool === 'place') {
    hintActionText.innerText = 'Colocar cubo';
  } else if (tool === 'erase') {
    hintActionText.innerText = 'Borrar cubo seleccionado';
  } else {
    hintActionText.innerText = 'Rotar y explorar cámara';
  }
}

toolButtons.place.addEventListener('click', () => { playSound('click'); setActiveTool('place'); });
toolButtons.erase.addEventListener('click', () => { playSound('click'); setActiveTool('erase'); });
toolButtons.orbit.addEventListener('click', () => { playSound('click'); setActiveTool('orbit'); });

// Atajos de teclado (1: Colocar, 2: Borrar, 3: Cámara)
window.addEventListener('keydown', (e) => {
  if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;

  if (e.key === '1') {
    playSound('click');
    setActiveTool('place');
  } else if (e.key === '2') {
    playSound('click');
    setActiveTool('erase');
  } else if (e.key === '3') {
    playSound('click');
    setActiveTool('orbit');
  } else if (e.key === 'Escape') {
    closeAllModals();
  }
});

// Selector de Color Nativo & Muestrarios de Paleta
const colorPickerInput = document.getElementById('color-picker-input');
const colorHexText = document.getElementById('color-hex-text');
const paletteSwatches = document.querySelectorAll('.palette-swatch');

function setCurrentColor(hex) {
  state.currentColor = hex;
  colorPickerInput.value = hex;
  colorHexText.innerText = hex.toUpperCase();

  // Resaltar swatch activo si coincide
  paletteSwatches.forEach(swatch => {
    const swatchColor = swatch.getAttribute('data-color');
    swatch.classList.toggle('active', swatchColor.toLowerCase() === hex.toLowerCase());
  });

  updateRollOver();
}

colorPickerInput.addEventListener('input', (e) => {
  setCurrentColor(e.target.value);
});

paletteSwatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    playSound('click');
    setCurrentColor(swatch.getAttribute('data-color'));
    // Si estaba en borrador, volver automáticamente a colocar cubo para comodidad
    if (state.currentTool === 'erase') {
      setActiveTool('place');
    }
  });
});

// Toggles de Escena (Cuadrícula, Bordes Voxel, Sonido)
const toggleGrid = document.getElementById('toggle-grid');
toggleGrid.addEventListener('change', (e) => {
  state.showGrid = e.target.checked;
  gridHelper.visible = state.showGrid;
  groundPlane.visible = state.showGrid;
});

const toggleEdges = document.getElementById('toggle-edges');
toggleEdges.addEventListener('change', (e) => {
  state.showEdges = e.target.checked;
  state.cubes.forEach(c => {
    const edges = c.getObjectByName('voxel-edges');
    if (edges) edges.visible = state.showEdges;
  });
});

const toggleSound = document.getElementById('toggle-sound');
toggleSound.addEventListener('change', (e) => {
  state.soundEnabled = e.target.checked;
});

// Controles flotantes de cámara
document.getElementById('cam-zoom-in').addEventListener('click', () => {
  playSound('click');
  camera.position.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 2.5);
  controls.update();
});

document.getElementById('cam-zoom-out').addEventListener('click', () => {
  playSound('click');
  camera.position.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), -2.5);
  controls.update();
});

document.getElementById('cam-reset').addEventListener('click', () => {
  playSound('click');
  centerCameraOnModel();
});

document.getElementById('cam-top').addEventListener('click', () => {
  playSound('click');
  const target = controls.target;
  camera.position.set(target.x, target.y + 25, target.z + 0.001);
  controls.update();
});

// Limpiar Escena
document.getElementById('btn-clear-scene').addEventListener('click', () => {
  if (state.cubes.length === 0) {
    showToast('El lienzo ya está vacío', 'info');
    return;
  }
  if (confirm('¿Estás seguro de que deseas vaciar el lienzo y comenzar un nuevo modelo?')) {
    clearScene();
  }
});

/* ==========================================================================
   SISTEMA DE PRESETS Y COMUNICACIÓN CON EL SERVIDOR NODE.JS
   ========================================================================== */

// Modales
const modalSave = document.getElementById('modal-save');
const modalPresets = document.getElementById('modal-presets');
const presetNameInput = document.getElementById('preset-name-input');
const saveThumbnailPreview = document.getElementById('save-thumbnail-preview');
const saveModalCubeCount = document.getElementById('save-modal-cube-count');
const presetsBadge = document.getElementById('presets-badge');

function closeAllModals() {
  modalSave.classList.remove('active');
  modalPresets.classList.remove('active');
}

// Genera una captura en miniatura nítida del modelo 3D actual
function captureThumbnail() {
  const prevVisible = rollOverMesh.visible;
  rollOverMesh.visible = false;
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/jpeg', 0.85);
  rollOverMesh.visible = prevVisible;
  return dataUrl;
}

// Abrir Modal de Guardar
document.getElementById('btn-open-save').addEventListener('click', () => {
  playSound('click');
  if (state.cubes.length === 0) {
    showToast('Coloca al menos un cubo antes de guardar tu composición', 'warning');
    return;
  }

  const thumb = captureThumbnail();
  saveThumbnailPreview.src = thumb;
  saveModalCubeCount.innerText = state.cubes.length;
  presetNameInput.value = `Mi Creación Voxel #${state.presets.length + 1}`;
  modalSave.classList.add('active');
  setTimeout(() => presetNameInput.focus(), 100);
});

document.getElementById('btn-close-save-modal').addEventListener('click', closeAllModals);
document.getElementById('btn-cancel-save').addEventListener('click', closeAllModals);

// Confirmar Guardado en Servidor
document.getElementById('btn-confirm-save').addEventListener('click', async () => {
  const name = presetNameInput.value.trim() || 'Composición sin título';
  const thumb = captureThumbnail();

  const cubesData = state.cubes.map(c => ({
    x: c.position.x,
    y: c.position.y,
    z: c.position.z,
    color: c.userData.color
  }));

  try {
    const res = await fetch('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        cubes: cubesData,
        thumbnail: thumb
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`¡Preset "${name}" guardado exitosamente en el servidor!`, 'success');
      closeAllModals();
      await fetchPresets(); // Actualizar lista e indexación
    } else {
      showToast('Error al guardar: ' + data.message, 'danger');
    }
  } catch (err) {
    console.error(err);
    showToast('Error de conexión con el servidor Node.js', 'danger');
  }
});

// Abrir Modal de Galería de Presets
document.getElementById('btn-open-presets').addEventListener('click', () => {
  playSound('click');
  modalPresets.classList.add('active');
  renderPresetsList();
});

document.getElementById('btn-close-presets-modal').addEventListener('click', closeAllModals);
document.getElementById('btn-close-presets-footer').addEventListener('click', closeAllModals);
document.getElementById('btn-refresh-presets').addEventListener('click', async () => {
  playSound('click');
  await fetchPresets();
  renderPresetsList();
  showToast('Lista de presets actualizada', 'info');
});

// Obtener presets desde el backend (GET /api/presets)
async function fetchPresets() {
  try {
    const res = await fetch('/api/presets');
    const data = await res.json();
    if (data.success) {
      state.presets = data.presets || [];
      presetsBadge.innerText = state.presets.length;
    }
  } catch (err) {
    console.error('No se pudieron obtener los presets:', err);
    showToast('No se pudo conectar al servidor local', 'warning');
  }
}

// Renderizar la lista de presets en el DOM
function renderPresetsList() {
  const loadingEl = document.getElementById('presets-loading');
  const emptyEl = document.getElementById('presets-empty');
  const gridEl = document.getElementById('presets-grid');

  loadingEl.classList.add('hidden');

  if (state.presets.length === 0) {
    emptyEl.classList.remove('hidden');
    gridEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');
  gridEl.innerHTML = '';

  state.presets.forEach(preset => {
    const card = document.createElement('div');
    card.className = 'preset-card';

    const dateStr = preset.createdAt
      ? new Date(preset.createdAt).toLocaleDateString() + ' ' + new Date(preset.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Fecha reciente';

    card.innerHTML = `
      <div class="preset-card-img">
        ${preset.thumbnail ? `<img src="${preset.thumbnail}" alt="${preset.name}">` : '<div class="preset-placeholder-icon">🧊</div>'}
        <span class="preset-badge-float">${preset.cubeCount || preset.cubes.length} cubos</span>
      </div>
      <div class="preset-card-info">
        <h4 class="preset-card-title" title="${preset.name}">${preset.name}</h4>
        <span class="preset-card-date">🕒 ${dateStr}</span>
      </div>
      <div class="preset-card-actions">
        <button class="btn btn-primary btn-load-preset" data-id="${preset.id}">
          <span>Cargar</span>
        </button>
        <button class="btn btn-danger-outline btn-delete-preset" data-id="${preset.id}" title="Eliminar preset del servidor">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    // Evento Cargar Preset
    card.querySelector('.btn-load-preset').addEventListener('click', () => {
      loadCubes(preset.cubes, false, preset.name);
      closeAllModals();
      showToast(`¡Preset "${preset.name}" cargado y sincronizado!`, 'success');
    });

    // Evento Eliminar Preset
    card.querySelector('.btn-delete-preset').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`¿Deseas eliminar permanentemente el preset "${preset.name}" del servidor?`)) {
        await deletePreset(preset.id);
      }
    });

    gridEl.appendChild(card);
  });
}

// Eliminar preset por ID
async function deletePreset(id) {
  try {
    const res = await fetch(`/api/presets/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Preset eliminado', 'info');
      await fetchPresets();
      renderPresetsList();
    } else {
      showToast('Error al eliminar: ' + data.message, 'danger');
    }
  } catch (err) {
    showToast('Error al comunicar con el servidor', 'danger');
  }
}

/* ==========================================================================
   SISTEMA DE TOASTS FLOTANTES
   ========================================================================== */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    success: '✅',
    info: '💡',
    warning: '⚠️',
    danger: '❌'
  };

  toast.innerHTML = `<span>${iconMap[type] || '✨'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

/* ==========================================================================
   LOOP DE ANIMACIÓN Y RENDERIZADO
   ========================================================================== */
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Iniciar animación
animate();

/* ==========================================================================
   SINCRONIZACIÓN EN TIEMPO REAL CON SOCKET.IO
   ========================================================================== */
if (socket) {
  // 1. Estado inicial del mundo al conectarse
  socket.on('init-world', (data) => {
    if (data && Array.isArray(data.cubes)) {
      loadCubes(data.cubes, true);
      if (data.cubes.length > 0) {
        showToast(`Lienzo sincronizado (${data.cubes.length} bloques activos)`, 'info');
      }
    }
  });

  // 2. Contador de usuarios en línea
  socket.on('users-count', (data) => {
    const countEl = document.getElementById('online-users-count');
    if (countEl && data && typeof data.count === 'number') {
      countEl.innerText = data.count;
    }
  });

  // 3. Otro usuario colocó un cubo
  socket.on('cube-placed', (data) => {
    if (data && typeof data.x === 'number') {
      placeCube(data.x, data.y, data.z, data.color, true);
    }
  });

  // 4. Otro usuario borró un cubo
  socket.on('cube-erased', (data) => {
    if (data && typeof data.x === 'number') {
      eraseCubeAt(data.x, data.y, data.z);
    }
  });

  // 5. Otro usuario limpió el lienzo
  socket.on('world-cleared', () => {
    clearScene(true);
    showToast('Un constructor limpió el lienzo colaborativo', 'info');
  });

  // 6. Otro usuario cargó un preset
  socket.on('world-loaded', (data) => {
    if (data && Array.isArray(data.cubes)) {
      loadCubes(data.cubes, true);
      showToast(`¡Un constructor cargó "${data.presetName || 'Preset'}"!`, 'info');
    }
  });
}

// Al arrancar la aplicación, indexar automáticamente los presets del backend
window.addEventListener('DOMContentLoaded', async () => {
  await fetchPresets();

  // Si no hay sockets activos, cargamos el primer modelo por defecto como respaldo
  if (!socket && state.presets.length > 0) {
    const firstPreset = state.presets[0];
    loadCubes(firstPreset.cubes, true);
    showToast(`Modelo inicial "${firstPreset.name}" cargado`, 'info');
  }
});
