const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './extension.ts',
  output: {
    filename: 'extension.bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
      ],
    }),
  ],
  mode: 'development', // Default mode
};