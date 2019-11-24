const Dotenv = require('dotenv-webpack')

module.exports = {
  target: 'webworker',
  entry: './index.js',
  mode: 'production',
  node: {
    fs: 'empty',
  },
  plugins: [new Dotenv()],
}
