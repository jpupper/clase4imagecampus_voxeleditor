# ⛏️ VoxelCraft 3D Studio - Editor Voxel tipo Minecraft

Editor en 3D interactivo tipo Minecraft desarrollado con **Three.js** en el frontend y un servidor **Node.js con Express** para la persistencia de composiciones.

![VoxelCraft 3D](public/css/style.css)

---

## ✨ Características

- 🎥 **Control y Navegación 3D**:
  - Orbitar y rotar libremente con el botón derecho del mouse o mediante el modo *Cámara Libre*.
  - Zoom con la rueda del ratón o botones en pantalla.
  - Botón de centrado de vista en el modelo.
- 🎨 **Paleta y Selector de Color**:
  - Paleta de bloques estilo Minecraft (Césped, Tierra, Piedra, Ladrillo, Madera, Diamante, Oro, Obsidiana, etc.).
  - Selector HTML5 nativo para elegir cualquier color personalizado.
- 🖌️ **Herramientas de Pincel y Borrador**:
  - **Pincel Colocar Cubo** (tecla `1`): Cubo fantasma que se ajusta a la cuadrícula y caras de otros cubos.
  - **Borrador** (tecla `2`): Resalta en rojo los cubos apuntados y los elimina al hacer clic.
  - **Cámara Libre** (tecla `3`): Inspecciona el modelo sin colocar ni borrar bloques por accidente.
- 💾 **Persistencia y Presets en el Servidor**:
  - Guardado en backend con captura automática de miniatura en tiempo real.
  - Indexación automática de presets guardados al recargar la página.
  - Galería con opción de cargar o eliminar modelos.
- 🔊 **Efectos de Sonido Sintéticos**: Efectos sonoros integrados mediante Web Audio API (sin dependencias de audio externas).

---

## 🚀 Inicio Rápido (Windows)

1. Haz doble clic en `install.bat` para instalar las dependencias (`npm install`).
2. Haz doble clic en `run.bat` para iniciar el servidor local.
3. Abre tu navegador en **http://localhost:3000**.

---

## 🛠️ Ejecución Manual desde Consola

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor
node server.js
```

El servidor quedará disponible en `http://localhost:3000`.

---

## 📁 Estructura del Proyecto

```text
├── data/
│   └── presets.json       # Almacenamiento local de composiciones guardadas
├── public/
│   ├── css/
│   │   └── style.css      # Estilos Glassmorphism en modo oscuro
│   ├── js/
│   │   └── app.js         # Lógica 3D, Three.js y comunicación con la API
│   └── index.html         # Interfaz web y HUD
├── install.bat            # Instalador rápido de dependencias
├── run.bat                # Script para arrancar el servidor
├── package.json           # Dependencias y scripts de npm
└── server.js              # Servidor Node.js / Express y API REST
```
