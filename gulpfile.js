const gulp = require('gulp'),
      zip = require('gulp-vinyl-zip'),
      pkg = require('pkg').exec;

gulp.task('compile', function (callback) {
    pkg(['vmb.js', '--target', 'node8-win-x64'])
        .then(() => {
            gulp.src(
                [
                    '%%template/**/*',
                    'vmb.exe',
                    'mods/'
                ],
                { base: '.' }
            )
            .pipe(zip('vmb.zip'))
            .pipe(gulp.dest('.'))
            .on('end', () => callback())
            .on('error', (err) =>{
                console.log(err);
                callback();
            })
        })
        .catch((err) => {
            console.log(err);
            callback();
        });
});
