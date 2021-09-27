// webpack.config.js
import path from 'path';
import sass from 'sass';

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nodeExternals = require('webpack-node-externals');
const HtmlWebpackPlugin = require('html-webpack-plugin');

export default {
  externals: [nodeExternals()],
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset',
        generator: {  //If emitting file, the file path is
          filename: 'fonts/[name][ext][query]'
        }
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        generator: {  //If emitting file, the file path is
          filename: 'images/[name][ext][query]'
        }
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.html/, 
        use: [{
          loader: "file-loader",
          options: {
            name: '[name].[ext]'
          }
        }], 
        generator: {  //If emitting file, the file path is
          filename: '[name][ext][query]'
        },
        
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          "style-loader",
          "css-loader",
          {
            loader: "sass-loader",
            options: {
              sourceMap: true,
              implementation: require.resolve("sass"),
              sassOptions: {
                indentWidth: 2,
                includePaths: ["styles/lib"],
              },
            },
          },
        ],
      },
    ],
  },
  entry: './scripts/main.js',
  output: {
    publicPath: "./",
    path: path.resolve(__dirname, '../build') + "/",
    filename: 'scripts/main.js'
  },
  devtool: 'source-map',
  resolve: {
    fallback: { 
      "stream": require.resolve("stream-browserify"), 
      "crypto": require.resolve("crypto-browserify"), 
      "https": require.resolve("https-browserify"), 
      "http": require.resolve("stream-http"), 
      "zlib": require.resolve("browserify-zlib"), 
      "buffer": require.resolve("buffer"),
      "util": require.resolve("util"),
      "assert": require.resolve("assert"),
      "os": require.resolve("os-browserify/browser")
    },
    modules: [path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, '../node_modules'), 'node_modules', '../node_modules']
  },
  plugins: [new HtmlWebpackPlugin({
    
  })],
  devServer: {
    static: {
      directory: path.join(__dirname, '../build'),
    },
  }
};
