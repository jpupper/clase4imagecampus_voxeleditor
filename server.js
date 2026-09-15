const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
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
    // Modelos predefinidos de ejemplo para empezar con contenido interesante
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

// ================= RUTAS DE LA API =================

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

  presets.unshift(newPreset); // Agregar al inicio de la lista
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

// Iniciar servidor
app.listen(PORT, () => {
  console.log('\n=============================================================');
  console.log('       MINECRAFT 3D VOXEL STUDIO - SERVIDOR INICIADO         ');
  console.log('=============================================================');
  console.log(` > Puerto de la aplicación: ${PORT}`);
  console.log(` > URL Local:               http://localhost:${PORT}`);
  console.log(' > Estado:                  Listo para crear y guardar mundos');
  console.log('=============================================================\n');
});
