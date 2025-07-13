const path = require('path');
const webpack = require('webpack');

module.exports = {
    entry: './src/browser.ts',
    target: 'web',
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        fallback: {
            "fs": false,
            "path": require.resolve("path-browserify"),
            "crypto": require.resolve("crypto-browserify"),
            "stream": require.resolve("stream-browserify"),
            "util": require.resolve("util"),
            "buffer": require.resolve("buffer"),
            "os": require.resolve("os-browserify/browser"),
            "http": false,
            "https": false,
            "url": require.resolve("url"),
            "net": false,
            "tls": false,
            "zlib": false,
            "querystring": require.resolve("querystring-es3"),
            "assert": require.resolve("assert"),
            "constants": require.resolve("constants-browserify"),
            "events": require.resolve("events"),
            "punycode": require.resolve("punycode"),
            "string_decoder": require.resolve("string_decoder"),
            "sys": require.resolve("util"),
            "vm": require.resolve("vm-browserify"),
            "process": require.resolve("process/browser")
        }
    },
    output: {
        filename: 'cipherpay-sdk.browser.js',
        path: path.resolve(__dirname, 'dist'),
        library: 'CipherPaySDK',
        libraryTarget: 'umd',
        libraryExport: 'CipherPaySDK',
        globalObject: 'this'
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env': JSON.stringify({}),
            'process.version': JSON.stringify('v16.0.0'),
            'process.platform': JSON.stringify('browser'),
            'process.browser': JSON.stringify(true),
            'process.env.NODE_ENV': JSON.stringify('production')
        }),
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer']
        })
    ]
}; 