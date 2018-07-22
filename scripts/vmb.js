const print = require('./print');
const version = require('./version');

// vmb driver
async function vmb(argv, configData) {

    // Read command line parameters
    const cl = require('./modules/cl')(argv);

    // Early execution and exit for --version param
    if(cl.get('version')) {
        console.log(version);
        return { exitCode: 0, finished: true };
    }

    // Init tasks
    const tasks = require('./tasks');
    const taskManager = require('./modules/task_manager')(tasks);

    // Get current task from commandline
    const { taskName, plainArgs } = taskManager.getCurrentTask(cl.get('_'));
    cl.setPlainArgs(plainArgs);

    // Early execution and exit for help task
    if (cl.get('h', 'help') || !taskName || taskName == 'help') {
        return await taskManager.runTask('help', taskName);
    }

    // Init config
    const config = require('./modules/config')();

    // Read config from file or object
    try {
        await config.readData(configData);
    }
    catch (err) {
        print.error(err);
        return { exitCode: 2, finished: true };
    }

    // Early execution and exit for config tasks
    if (taskName == 'config') {
        return await taskManager.runTask(taskName);
    }

    // Parse config data
    try {
        await config.parseData();
    }
    catch (err) {
        print.error(err);
        return { exitCode: 3, finished: true };
    }

    // Init item cfg reader
    require('./modules/cfg')();

    // Run task
    return await taskManager.runTask(taskName);
}

module.exports = vmb;
