const path = require('path');
const fs = require('fs');

// plugins ディレクトリ内のすべてのプラグインを検出
const pluginsDir = path.resolve(__dirname, 'src/plugins');
const entries = {};

if (fs.existsSync(pluginsDir)) {
  fs.readdirSync(pluginsDir).forEach(plugin => {
    const pluginPath = path.join(pluginsDir, plugin);
    const indexPath = path.join(pluginPath, 'index.ts');

    if (fs.statSync(pluginPath).isDirectory() && fs.existsSync(indexPath)) {
      entries[plugin] = indexPath;
    }
  });
}

module.exports = {
  entry: entries,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/index.js',
    library: {
      type: 'module',
    },
  },
  experiments: {
    outputModule: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  devtool: 'source-map',
  mode: 'development',
};
