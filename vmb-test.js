const pfs = require('./scripts/lib/pfs');
const vmb = require('./scripts/vmb');

(async () => {

    await cleanup();

    let config = {};

    await runTest('create', [
        'create',
        'test'
    ], config);

    await runTest('build', [
        'build',
        'test'
    ], config);

    await runTest('publish', [
        'publish',
        'test',
        '-g',
        '1'
    ], config);

    await runTest('config', [
        'config',
        '--game',
        '1'
    ], config);

    await runTest('upload 1', [
        'upload',
        'test'
    ], config);

    await runTest('reset', [
        '--reset'
    ], config);

    await runTest('upload 2', [
        'upload',
        'test'
    ], config);

    console.log(`Succesfully finished all tests`);

    await cleanup();

})();


async function cleanup() {
    await pfs.deleteDirectory('mods/test').catch(err => { });
}

async function runTest(name, params, config) {
    console.log(`Running test '${name}' with params "${params.join(' ')}"`);

    let defaultParams = [
        '--cwd',
        '--debug'
    ];

    params = params.concat(defaultParams);

    let { exitCode } = await vmb(params, config);

    if (exitCode) {
        console.error(`Failed test '${name}' with code ${exitCode}`);
        await cleanup();
        process.exit(exitCode);
    }

    console.log(`Succesfully finished test '${name}'\n`);
}