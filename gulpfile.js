const gulp = require('gulp'),
      merge = require('merge-stream'),
      pfs = require('./scripts/lib/pfs'),
      zip = require('gulp-vinyl-zip').zip,
      pkg = require('pkg').exec;

gulp.task('build', async function(callback) {
    try {
        let version = await applyVersion();
        await pkg(['.']);
        await zipVmb(version);
    }
    catch(err) {
        console.error(err);
    }
    callback();
});

function zipVmb(version) {
    return new Promise((resolve, reject) => {

        let s1 = gulp.src(
            [
                '.template/**/*',
                '.template-vmf/**/*',
                'vmb.exe',
                'mods/',
                'README.md',
                'LICENSE'
            ],
            { base: '.' }
        );

        let s2 = gulp.src(
            [
                'node_modules/robotjs/build/Release/robotjs.node'
            ],
            { base: './node_modules/robotjs/build/Release/' }
        );

        merge(s1, s2).pipe(zip(`vmb-${version}.zip`))
            .pipe(gulp.dest('.'))
            .on('end', () => resolve())
            .on('error', (err) => {
                console.log(err);
                reject();
            });
    });
}

async function applyVersion() {
    let config = await pfs.readFile('./package.json', 'utf-8');
    config = JSON.parse(config);
    let content = `module.exports = '${config.version}';\n`;
    await pfs.writeFile('./scripts/version.js', content);
    return config.version;
}
