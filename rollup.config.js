import nodeResolve from '@rollup/plugin-node-resolve';

export default {
    input: 'src/main.js',
    output: {
        file: 'public/bundle.js',
        format: 'iife',
        sourcemap: true
    },
    plugins: [
        nodeResolve(),
    ]
}