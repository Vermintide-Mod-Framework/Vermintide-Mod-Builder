const print = require('./print');

// vmb driver
async function vmb(argv, configData) {

    // Read command line parameters
    const cl = require('./cl')(argv);

    // Init tasks
    const tasks = require('./tasks');
    const taskManager = require('./task_manager')(tasks);

    // Get current task from commandline
    const { taskName, plainArgs } = taskManager.getCurrentTask(cl.get('_'));
    cl.setPlainArgs(plainArgs);

    // Init config
    const config = require('./config')();

    // Read config from file or object
    try {
        await config.readData(configData);
    }
    catch (err) {
        print.error(err);
        return { exitCode: 2, finished: true };
    }

    // Early execution and exit for certain tasks
    if (taskName == 'help' || taskName == 'config') {
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
    require('./cfg')();


    // Run task
    return await taskManager.runTask(taskName);
}

module.exports = vmb;
