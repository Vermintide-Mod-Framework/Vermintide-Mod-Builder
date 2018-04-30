(async () => {
    let { exitCode, finished } = await (require('./scripts/vmb')(process.argv));
    if (finished) {
        process.exit(exitCode);
    }
})();
