# ReEarth_GeoSuite_React

**React-based version of Re:Earth GeoSuite Plugin**

This is a modern React-based implementation of the Re:Earth GeoSuite plugin, providing a more maintainable and scalable codebase for the integrated plugin suite.

## 🚀 Features

- **React + TypeScript**: Modern React 19 with full TypeScript support
- **Vite**: Lightning-fast build tool and dev server
- **Component-Based Architecture**: Modular, reusable components
- **Type-Safe**: Full type definitions for Re:Earth Visualizer API

## 📋 Components

### Main Components

- **LayerList**: Manages and displays layers with visibility toggles
- **InfoPanel**: Displays external HTML content in an iframe
- **SettingsPanel**: Controls for Terrain, Shadow, and time settings

## 🛠️ Development

### Prerequisites

- Node.js 18+ 
- npm 9+

### Installation

```bash
cd geo_suite_react
npm install
```

### Development Server

```bash
npm run dev
```

This starts the Vite development server with hot module replacement (HMR).

### Build for Production

```bash
npm run build
```

This compiles TypeScript and builds the production-ready bundle in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## 📁 Project Structure

```
geo_suite_react/
├── src/
│   ├── components/          # React components
│   │   ├── LayerList.tsx
│   │   ├── InfoPanel.tsx
│   │   └── SettingsPanel.tsx
│   ├── types/               # TypeScript type definitions
│   │   └── reearth.d.ts
│   ├── App.tsx              # Main application component
│   ├── App.css              # Application styles
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles
├── public/                  # Static assets
├── index.html               # HTML template
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Dependencies and scripts
```

## 🔗 Integration with Re:Earth Visualizer

This plugin is designed to work with Re:Earth Visualizer. The plugin communicates with the Visualizer through the `window.reearth` API and postMessage events.

### API Communication

- **From Plugin to Visualizer**: Uses `window.parent.postMessage()` to send commands
- **From Visualizer to Plugin**: Listens to `message` events for state updates

## 📝 Configuration

The plugin supports configuration through Re:Earth Visualizer's Inspector panel:

```
xyz: OpenStreetMap | https://tile.openstreetmap.org/{z}/{x}/{y}.png
xyz: 地理院タイル 標準地図 | https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png
background: #ffffff
info: https://re-earth-geo-suite.vercel.app/ryu.html
```

## 🧪 Testing

```bash
npm run lint
```

## 📄 License

MIT License

## 👤 Author

[yamamoto-ryuzo](https://github.com/yamamoto-ryuzo)

---

**Note**: This is the React-based version of ReEarth_GeoSuite. For the original TypeScript/HTML version, see the main repository.
