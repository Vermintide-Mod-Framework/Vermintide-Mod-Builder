const gulp = require('gulp'),
      pfs = require('./scripts/lib/pfs'),
      zip = require('gulp-vinyl-zip').zip,
      pkg = require('pkg').exec;

gulp.task('compile', async function(callback) {
    try {
        await applyVersion();
        await pkg(['.']);
        await zipVmb();
    }
    catch(err) {
        console.error(err);
    }
    callback();
});

function zipVmb() {
    return new Promise((resolve, reject) => {
        gulp.src(
            [
                '.template/**/*',
                '.template-vmf/**/*',
                'vmb.exe',
                'mods/',
                'README.md'
            ],
            { base: '.' }
        )
            .pipe(zip('vmb.zip'))
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
}
