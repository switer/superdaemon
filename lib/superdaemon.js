var util = require("util");
var fs = require("fs");
var childProcess = require('child_process');
var spawn = childProcess.spawn;
var path = require("path");
var fileExtensionPattern;
var startChildProcess;
var noRestartOn = null;
var verbose = false;
var version = false;
var ignoredPaths = {};
var forceWatchFlag = false;
var colors = require('colors');
var util = require('./util');
var helpText = require('./help');
var logger = require('./logger');
var log = logger.create('[Super Daemon]'.yellow);
var meta = require('../package.json');
var childs = require('./childs');
var StillAlive = require('./stillalive');


exports.run = run;

function run(args) {
    var arg, next, watch, ignore, program, extensions, poll_interval;
    while (arg = args.shift()) {
        if (arg === "--help" || arg === "-h" || arg === "-?") {
            return help();
        } else if (arg === "--quiet" || arg === "-q") {
            logger.quiet(true);
        } else if (arg === "--verbose" || arg === "-V") {
            verbose = true;
        } else if (arg === "--version") {
            version = true;
        } else if (arg === "--watch" || arg === "-w") {
            watch = args.shift();
        } else if (arg === "--ignore" || arg === "-i") {
            ignore = args.shift();
        } else if (arg === "--poll-interval" || arg === "-p") {
            poll_interval = parseInt(args.shift());
        } else if (arg === "--extensions" || arg === "-e") {
            extensions = args.shift();
        // } else if (arg === "--no-restart-on" || arg === "-n") {
        //     noRestartOn = args.shift();
        } else if (arg === "--force-watch") {
            forceWatchFlag = true;
        } else if (arg === "--") {
            program = args.join(' ');
            break;
        } else if (arg[0] != "-" && !args.length) {
            // Assume last arg is the program
            program = arg;
        }
    }
    if (version) {
        return console.log(meta.version);
    }
    if (!program) {
        return help();
    }
    if (!watch) {
        watch = ".";
    }
    if (!poll_interval) {
        poll_interval = 1000;
    }

    if (!extensions) {
        // If no extensions passed try to guess from the program
        extensions = "node,js";
    }

    fileExtensionPattern = new RegExp("^.*\.(" + extensions.replace(/,/g, "|") + ")$");

    try {
        // Pass kill signals through to child
        ["SIGTERM", "SIGINT", "SIGHUP", "SIGQUIT"].forEach(function(signal) {
            process.on(signal, function() {
                var processes = childs.all();
                for (var id in processes) {
                    var child = processes[id];
                    log("Sending " + signal + " to child...[" + child.process.pid + "]");
                    child.process.kill(signal);
                }
                process.exit();
            });
        });
    } catch (e) {
        // Windows doesn't support signals yet, so they simply don't get this handling.
        // https://github.com/joyent/node/issues/1553
    }

    log("\nRunning superdaemon with" 
        + "\n    program '" + program + "'" 
        + "\n    --watch '" + watch + "'" 
        + (ignore ? "\n    --ignore '" + ignore + "'" : '') 
        + "\n    --extensions '" + extensions + "'" 
        + "\n");

    // store the call to startProgramm in startChildProcess
    // in order to call it later
    startChildProcess = function() {
        var programs = program.split(' ++ '),
            delay = 0;

        util.chaining(programs, function (program, index, next) {
            program = program.trim();
            program = program.replace(/^(\d+)\s/, function (matches, $1) {
                delay = parseInt($1);
                return '';
            });
            startProgram(program, index, {
                delay: delay,
                callback: function () {
                    next();
                }
            });
        }, function () {
            // Done
        });
    };

    // if we have a program, then run it, and restart when it crashes.
    // if we have a watch folder, then watch the folder for changes and restart the prog
    startChildProcess();

    if (ignore) {
        var ignoreItems = ignore.split(',');
        ignoreItems.forEach(function(ignoreItem) {
            ignoreItem = path.resolve(ignoreItem);
            ignoredPaths[ignoreItem] = true;
            log("Ignoring directory '" + ignoreItem + "'.");
        });
    }

    var watchItems = watch.split(',');
    watchItems.forEach(function(watchItem) {
        watchItem = path.resolve(watchItem);
        log("Watching directory '" + watchItem + "' for changes.");
        findAllWatchFiles(watchItem, function(f) {
            watchGivenFile(f, poll_interval);
        });
    });
};

function help() {
    console.log(helpText);
};

function startProgram(prog, id, options) {
    options = options || {};

    var processLabelLog = logger.create( logger.allotColor('[' + id + ']', id), true),
        noLabelLog = logger.create('', true),
        lastHasLineEnd = true,
        stillAlive = new StillAlive(options.delay || 0, options.callback);


    log("Run \"" + prog + "\"");
    var child = childProcess.exec(prog, {});
    childs.set({
        id: id,
        process: child,
        program: prog,
        options: options
    });
    if (child.stdout) {
        function printHandler (chunk) {
            if (!chunk) return;
            if (lastHasLineEnd) {
                processLabelLog(chunk);
            } else {
                noLabelLog(chunk);
            }
            if (chunk.match(/\n\s*$/)) lastHasLineEnd = true;
            else lastHasLineEnd = false;

            stillAlive.pluse();
        }
        child.stdout.on("data", printHandler);
        child.stderr.on("data", printHandler);
    }
    child.on("exit", function(code) {
        if (!crash_queued) {
            log("Program \"" + prog + "\" " + (code === 0 ? 'complete' : ('exited with code ' + code) ) + "\n");
            // if (noRestartOn == "exit" || noRestartOn == "error" && code !== 0) return;
        }
        stillAlive.die();
    });
}

var timer = null,
    mtime = null,
    crash_queued = false,
    killingCallbck = function () {};

function crash() {

    if (crash_queued) return;

    crash_queued = true;
    var processes = childs.all();

    util.chaining(processes, function (item, key, next) {
        var ps = item.process;
        ps.on('exit', function (code) {
            log('shutdown process [' + ps.pid + ']');
            if (!crash_queued) return;
            setTimeout( function() {
                item.options.callback = function () {
                    // next step
                    next();
                }
                startProgram(item.program, item.id, item.options);
            }, item.options.delay);
        });
        process.kill(ps.pid);
        // ps.kill();
    }, function () {
        // all process is starting
        crash_queued = false;
        killingCallbck = null;
    });
}

function crashWin(event, filename) {
    var shouldCrash = true;
    if (event === 'change') {
        if (filename) {
            filename = path.resolve(filename);
            Object.keys(ignoredPaths).forEach(function(ignorePath) {
                if (filename.indexOf(ignorePath + '\\') === 0 || filename === ignorePath) {
                    shouldCrash = false;
                }
            });
        }
        if (shouldCrash)
            crash();
    }
}

function crashOther(oldStat, newStat) {
    // we only care about modification time, not access time.
    if (newStat.mtime.getTime() !== oldStat.mtime.getTime()) {
        crash();
    }
}

var nodeVersion = process.version.split(".");
var isWindowsWithoutWatchFile = process.platform === 'win32' && parseInt(nodeVersion[1]) <= 6;

function watchGivenFile(watch, poll_interval) {
    if (isWindowsWithoutWatchFile || forceWatchFlag)
        fs.watch(watch, {
            persistent: true,
            interval: poll_interval
        }, crashWin);
    else
        fs.watchFile(watch, {
            persistent: true,
            interval: poll_interval
        }, crashOther);
    if (verbose)
        log("watching file '" + watch + "'");
}

var findAllWatchFiles = function(dir, callback) {
    dir = path.resolve(dir);
    if (ignoredPaths[dir])
        return;
    fs.stat(dir, function(err, stats) {
        if (err) {
            console.error('Error retrieving stats for file: ' + dir);
        } else {
            if (stats.isDirectory()) {
                if (isWindowsWithoutWatchFile || forceWatchFlag) callback(dir);
                fs.readdir(dir, function(err, fileNames) {
                    if (err) {
                        console.error('Error reading path: ' + dir);
                    } else {
                        fileNames.forEach(function(fileName) {
                            findAllWatchFiles(path.join(dir, fileName), callback);
                        });
                    }
                });
            } else {
                if ((!isWindowsWithoutWatchFile || !forceWatchFlag) && dir.match(fileExtensionPattern)) {
                    callback(dir);
                }
            }
        }
    });
};
