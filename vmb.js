(async () => {
    let { exitCode, shouldExit } = await (require('./scripts/vmb')(process.argv));
    if (shouldExit) {
        process.exit(exitCode);
    }
})();
