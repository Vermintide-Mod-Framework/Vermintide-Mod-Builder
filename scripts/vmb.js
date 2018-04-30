
// vmb driver
async function vmb(argv) {

    // Read command line parameters
    const cl = require('./cl');
    cl.init(argv);

    // Init tasks
    let tasks = require('./tasks');
    let taskManager = require('./task_manager');
    taskManager.init(tasks);

    // Get current task from commandline
    const { taskName, plainArgs } = taskManager.getCurrentTask(cl.argv._);

    // Init config
    const config = require('./config');
    config.init();

    // Read config from file
    try {
        await config.readData('.vmbrc', cl.argv);
    }
    catch (err) {
        console.error(err);
        return { exitCode: 2, shouldExit: true };
    }

    // Early execution and exit for certain tasks
    if (taskName == 'default' || taskName == 'config') {
        return await taskManager.runTask(taskName, plainArgs);
    }

    // Parse config data
    try {
        await config.parseData(cl.argv);
    }
    catch (err) {
        console.error(err);
        return { exitCode: 3, shouldExit: true };
    }

    // Run task
    return await taskManager.runTask(taskName, plainArgs);
}

module.exports = vmb;
