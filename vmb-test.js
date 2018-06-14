const pfs = require('./scripts/lib/pfs');
const vmb = require('./scripts/vmb');

(async () => {

    await cleanup();

    await runTest('create', [
        'create',
        'test'
    ]);

    await runTest('build', [
        'build',
        'test'
    ]);

    await runTest('publish', [
        'publish',
        'test',
        '-g',
        '1'
    ]);

    await runTest('config', [
        'config',
        '--game',
        '1'
    ]);

    await runTest('upload 1', [
        'upload',
        'test'
    ]);

    await runTest('reset', [
        '--reset'
    ]);

    await runTest('upload 2', [
        'upload',
        'test'
    ]);

    console.log(`Succesfully finished all tests`);

    await cleanup();

})();


async function cleanup() {
    await pfs.deleteFile('.vscode', '.vmbrc').catch(err => { });
    await pfs.deleteDirectory('mods/test').catch(err => { });
}

async function runTest(name, params) {
    console.log(`Running test ${name} with params "${params.join(' ')}"`);

    let defaultParams = [
        '--rc',
        '.vscode',
        '--cwd',
        '--debug'
    ];
    params.concat(defaultParams);

    let { exitCode } = await vmb(params);

    if (exitCode) {
        console.error(`Failed upload ${name} with code ${exitCode}`);
        await cleanup();
        process.exit(exitCode);
    }

    console.log(`Succesfully finished test ${name}\n`);
}