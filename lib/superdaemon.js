var util = require("util");
var fs = require("fs");
var childProcess = require('child_process');
var spawn = childProcess.spawn;
var path = require("path");
var fileExtensionPattern;
var startChildProcess;
var noRestartOn = null;
var debug = true;
var verbose = false;
var ignoredPaths = {};
var forceWatchFlag = false;
var colors = require('colors');
var util = require('./util');
var labelLog = function (label, isStdout) {
    return function() {
        // body...
        var args = Array.prototype.slice.call(arguments);
        if (args.length && args.join('').trim()) {
            args.unshift(label)
        }
        if (isStdout && process.stdout.write) {
            process.stdout.write(args.join(' '))
        } else {
            console.log.apply(console, args);
        }
    }
}
var log = labelLog('[Super Daemon]'.yellow);
var LABEL_COLORS = ['blue.grey', 'green.grey', 'yellow.grey', 'white.grey', 'blue', 'green', 'yellow', 'grey'];
var colorCorsor = 0;
var allotColor = function (text) {
    var color = LABEL_COLORS[(colorCorsor ++) % LABEL_COLORS.length];
    var colorKeys = color.split('.');
    colorKeys.forEach(function (c) {
        text = text[c];
    });
    return text;
}


exports.run = run;

function run(args) {
    var arg, next, watch, ignore, program, extensions, poll_interval;
    while (arg = args.shift()) {
        if (arg === "--help" || arg === "-h" || arg === "-?") {
            return help();
        } else if (arg === "--quiet" || arg === "-q") {
            debug = false;
            log = function() {};
        } else if (arg === "--verbose" || arg === "-V") {
            verbose = true;
        } else if (arg === "--watch" || arg === "-w") {
            watch = args.shift();
        } else if (arg === "--ignore" || arg === "-i") {
            ignore = args.shift();
        } else if (arg === "--poll-interval" || arg === "-p") {
            poll_interval = parseInt(args.shift());
        } else if (arg === "--extensions" || arg === "-e") {
            extensions = args.shift();
        } else if (arg === "--no-restart-on" || arg === "-n") {
            noRestartOn = args.shift();
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
                var child = exports.child;
                if (child) {
                    log("Sending " + signal + " to child...");
                    child.kill(signal);
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
        var programs = program.split(' & '),
            delay = 0;
        programs.forEach(function (program, index) {
            program = program.trim();
            program = program.replace(/^(\d+)\s/, function (matches, $1) {
                delay+= parseInt($1);
                return '';
            });
            setTimeout( function() {
                startProgram(program, index);
            }, delay);                
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
    console.log(fs.readFileSync(__dirname + '/../help', 'utf-8'));
};

function startProgram(prog, id) {
    var processLog = labelLog( allotColor('[' + id + ']'), true),
        noLabelLog = labelLog('', true),
        isNewLine = true;

    log("Run \"" + prog + "\"");
    crash_queued = false;
    var child = exports.child = childProcess.exec(prog, {});
    if (child.stdout) {
        child.stdout.on("data", function(chunk) {
            if (!chunk) return;
            if (isNewLine) {
                processLog(chunk);
            } else {
                noLabelLog(chunk)
            }
            if (chunk.match(/\n/)) isNewLine = true;
            else isNewLine = false;
        });
        child.stderr.on("data", function(chunk) {
            if (!chunk) return;
            if (isNewLine) {
                processLog(chunk);
            } else {
                noLabelLog(chunk)
            }

            if (chunk.match(/\n/)) isNewLine = true;
            else isNewLine = false;
        });
    }
    child.on("exit", function(code) {
        if (!crash_queued) {
            log("Program \"" + prog + "\" " + (code === 0 ? 'run success' : ('exited with code ' + code) ) + "\n");
            exports.child = null;
            if (noRestartOn == "exit" || noRestartOn == "error" && code !== 0) return;
        }
    });
}

var timer = null,
    mtime = null,
    crash_queued = false;

function crash() {

    if (crash_queued)
        return;

    crash_queued = true;
    var child = exports.child;
    setTimeout(function() {
        if (child) {
            log("crashing child");
            process.kill(child.pid);
        } else {
            log("restarting child");
            startChildProcess();
        }
    }, 50);
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
    if (newStat.mtime.getTime() !== oldStat.mtime.getTime())
        crash();
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
