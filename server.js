const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '15mb' })); // Permitir thumbnails en base64
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));

// Ruta del archivo de persistencia
const DATA_DIR = path.join(__dirname, 'data');
const PRESETS_FILE = path.join(DATA_DIR, 'presets.json');

// Asegurar que la carpeta data y el archivo presets.json existan
function initDataStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(PRESETS_FILE)) {
    // Modelos predefinidos de ejemplo
    const initialPresets = [
      {
        id: 'preset-arbol-1',
        name: 'Árbol Clásico Voxel',
        createdAt: new Date().toISOString(),
        cubeCount: 16,
        cubes: [
          // Tronco de madera (#795548)
          { x: 0, y: 0.5, z: 0, color: '#795548' },
          { x: 0, y: 1.5, z: 0, color: '#795548' },
          { x: 0, y: 2.5, z: 0, color: '#795548' },
          // Hojas verdes (#4caf50)
          { x: 0, y: 3.5, z: 0, color: '#4caf50' },
          { x: 1, y: 2.5, z: 0, color: '#4caf50' },
          { x: -1, y: 2.5, z: 0, color: '#4caf50' },
          { x: 0, y: 2.5, z: 1, color: '#4caf50' },
          { x: 0, y: 2.5, z: -1, color: '#4caf50' },
          { x: 1, y: 3.5, z: 0, color: '#4caf50' },
          { x: -1, y: 3.5, z: 0, color: '#4caf50' },
          { x: 0, y: 3.5, z: 1, color: '#4caf50' },
          { x: 0, y: 3.5, z: -1, color: '#4caf50' },
          { x: 1, y: 3.5, z: 1, color: '#4caf50' },
          { x: -1, y: 3.5, z: -1, color: '#4caf50' },
          { x: 1, y: 3.5, z: -1, color: '#4caf50' },
          { x: -1, y: 3.5, z: 1, color: '#4caf50' }
        ]
      },
      {
        id: 'preset-espada-1',
        name: 'Mini Espada Voxel',
        createdAt: new Date().toISOString(),
        cubeCount: 8,
        cubes: [
          { x: -2, y: 0.5, z: 0, color: '#5d4037' },
          { x: -1, y: 1.5, z: 0, color: '#ffb300' },
          { x: -1, y: 0.5, z: 0, color: '#ffb300' },
          { x: -2, y: 1.5, z: 0, color: '#ffb300' },
          { x: 0, y: 2.5, z: 0, color: '#00e5ff' },
          { x: 1, y: 3.5, z: 0, color: '#00e5ff' },
          { x: 2, y: 4.5, z: 0, color: '#00e5ff' },
          { x: 3, y: 5.5, z: 0, color: '#00e5ff' }
        ]
      }
    ];

    fs.writeFileSync(PRESETS_FILE, JSON.stringify(initialPresets, null, 2), 'utf-8');
  }
}

initDataStorage();

// Helper para leer presets
function readPresets() {
  try {
    const raw = fs.readFileSync(PRESETS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error al leer presets:', error);
    return [];
  }
}

// Helper para guardar presets
function writePresets(presets) {
  try {
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error al guardar presets:', error);
    return false;
  }
}

// ================= ESTADO DEL MUNDO COLABORATIVO (SOCKETS) =================
// Mapa en memoria que guarda el estado activo del lienzo compartido
// Clave: "x,y,z" -> { x, y, z, color }
const activeCubes = new Map();

function initActiveWorld() {
  const presets = readPresets();
  if (presets.length > 0 && Array.isArray(presets[0].cubes)) {
    presets[0].cubes.forEach(c => {
      const key = `${Number(c.x).toFixed(1)},${Number(c.y).toFixed(1)},${Number(c.z).toFixed(1)}`;
      activeCubes.set(key, { x: c.x, y: c.y, z: c.z, color: c.color });
    });
  }
}

initActiveWorld();

io.on('connection', (socket) => {
  const onlineCount = io.engine.clientsCount;
  console.log(`[Socket.IO] Cliente conectado: ${socket.id} (Constructores online: ${onlineCount})`);

  // 1. Enviar estado actual del lienzo compartido al nuevo usuario conectado
  socket.emit('init-world', {
    cubes: Array.from(activeCubes.values())
  });

  // 2. Notificar a todos el total de usuarios en línea
  io.emit('users-count', { count: onlineCount });

  // 3. Evento: Colocar cubo
  socket.on('place-cube', (data) => {
    if (data && typeof data.x === 'number' && typeof data.y === 'number' && typeof data.z === 'number' && data.color) {
      const key = `${Number(data.x).toFixed(1)},${Number(data.y).toFixed(1)},${Number(data.z).toFixed(1)}`;
      activeCubes.set(key, { x: data.x, y: data.y, z: data.z, color: data.color });
      // Retransmitir a todos los demás clientes
      socket.broadcast.emit('cube-placed', data);
    }
  });

  // 4. Evento: Borrar cubo
  socket.on('erase-cube', (data) => {
    if (data && typeof data.x === 'number' && typeof data.y === 'number' && typeof data.z === 'number') {
      const key = `${Number(data.x).toFixed(1)},${Number(data.y).toFixed(1)},${Number(data.z).toFixed(1)}`;
      activeCubes.delete(key);
      // Retransmitir a todos los demás clientes
      socket.broadcast.emit('cube-erased', data);
    }
  });

  // 5. Evento: Limpiar lienzo completo
  socket.on('clear-world', () => {
    activeCubes.clear();
    socket.broadcast.emit('world-cleared');
  });

  // 6. Evento: Cargar un preset compartido en el lienzo
  socket.on('load-world', (data) => {
    if (data && Array.isArray(data.cubes)) {
      activeCubes.clear();
      data.cubes.forEach(c => {
        const key = `${Number(c.x).toFixed(1)},${Number(c.y).toFixed(1)},${Number(c.z).toFixed(1)}`;
        activeCubes.set(key, { x: c.x, y: c.y, z: c.z, color: c.color });
      });
      socket.broadcast.emit('world-loaded', {
        cubes: data.cubes,
        presetName: data.presetName || 'Preset compartido'
      });
    }
  });

  // 7. Desconexión
  socket.on('disconnect', () => {
    const remaining = io.engine.clientsCount;
    console.log(`[Socket.IO] Cliente desconectado: ${socket.id} (Restantes: ${remaining})`);
    io.emit('users-count', { count: remaining });
  });
});

// ================= RUTAS DE LA API REST =================

// 1. Obtener todos los presets guardados
app.get('/api/presets', (req, res) => {
  const presets = readPresets();
  res.json({
    success: true,
    count: presets.length,
    presets: presets
  });
});

// 2. Guardar un nuevo preset
app.post('/api/presets', (req, res) => {
  const { name, cubes, thumbnail } = req.body;

  if (!name || !Array.isArray(cubes)) {
    return res.status(400).json({
      success: false,
      message: 'Nombre y listado de cubos requeridos.'
    });
  }

  const presets = readPresets();
  const newId = 'preset-' + Date.now();

  const newPreset = {
    id: newId,
    name: name.trim() || 'Composición sin título',
    createdAt: new Date().toISOString(),
    cubeCount: cubes.length,
    cubes: cubes,
    thumbnail: thumbnail || null
  };

  presets.unshift(newPreset);
  const saved = writePresets(presets);

  if (saved) {
    res.status(201).json({
      success: true,
      message: 'Preset guardado exitosamente.',
      preset: newPreset
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'Error en el servidor al guardar el archivo.'
    });
  }
});

// 3. Eliminar un preset por id
app.delete('/api/presets/:id', (req, res) => {
  const { id } = req.params;
  let presets = readPresets();
  const initialLength = presets.length;

  presets = presets.filter(p => p.id !== id);

  if (presets.length === initialLength) {
    return res.status(404).json({
      success: false,
      message: 'Preset no encontrado.'
    });
  }

  writePresets(presets);
  res.json({
    success: true,
    message: 'Preset eliminado correctamente.'
  });
});

// Ruta comodín para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor HTTP con WebSockets
server.listen(PORT, () => {
  console.log('\n=============================================================');
  console.log('   MINECRAFT 3D VOXEL STUDIO - SERVIDOR COLABORATIVO ACTIVO  ');
  console.log('=============================================================');
  console.log(` > Puerto de la aplicación: ${PORT}`);
  console.log(` > URL Local:               http://localhost:${PORT}`);
  console.log(' > Modo Sockets:            Sincronización en tiempo real activa');
  console.log('=============================================================\n');
});
