const gulp = require('gulp'),
      zip = require('gulp-vinyl-zip').zip,
      pkg = require('pkg').exec;

gulp.task('compile', async function(callback) {
    try {
        await pkg(['vmb.js', '--target', 'node8-win-x64']);
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