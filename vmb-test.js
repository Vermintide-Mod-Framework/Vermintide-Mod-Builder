const pfs = require('./scripts/lib/pfs');
const vmb = require('./scripts/vmb');

(async () => {

    await cleanup();

    await runTest('create', [
        'create',
        'test',
        '--rc',
        '.vmbrc-test'
    ]);

    await runTest('build', [
        'build',
        'test',
        '--rc',
        '.vmbrc-test'
    ]);

    await runTest('publish', [
        'publish',
        'test',
        '-g',
        '1',
        '--rc',
        '.vmbrc-test'
    ]);

    await runTest('config', [
        'config',
        '--game',
        '1',
        '--rc',
        '.vmbrc-test'
    ]);

    await runTest('upload 1', [
        'upload',
        'test',
        '--rc',
        '.vmbrc-test'
    ]);

    await runTest('reset', [
        '--reset',
        '--rc',
        '.vmbrc-test'
    ]);

    await runTest('upload 2', [
        'upload',
        'test',
        '--rc',
        '.vmbrc-test'
    ]);

    console.log('Succesfully finished all tests');

    cleanup();

})();


async function cleanup() {
    await pfs.deleteFile('.', '.vmbrc-test').catch(err => { });
    await pfs.deleteDirectory('mods/test').catch(err => { });
}

async function runTest(name, params) {
    console.log(`Running test ${name} with params "${params.join(' ')}"`);
    let { exitCode } = await vmb(params);
    if (exitCode) {
        console.error(`Failed upload ${name} with code ${exitCode}`);
        await cleanup();
        process.exit(exitCode);
    }
    console.log(`Succesfully finished test ${name}\n`);
}