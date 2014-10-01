# superdaemon

Superdaemon is base on [node-supervisor](https://github.com/isaacs/node-supervisor), but it support running multiple
bin in the same time.
## superdaemon

    Node Superdaemon is used to restart programs when they crash.
    It can also be used to restart programs when a *.js file changes.

    Usage:
      superdaemon [options] <program>
      superdaemon [options] -- <program> [args ...]

    Required:
      <program>
        The program to run.

    Options:
      -w|--watch <watchItems>
        A comma-delimited list of folders or js files to watch for changes.
        When a change to a js file occurs, reload the program
        Default is '.'

      -i|--ignore <ignoreItems>
        A comma-delimited list of folders to ignore for changes.
        No default

      -p|--poll-interval <milliseconds>
        How often to poll watched files for changes.
        Defaults to Node default.

      -e|--extensions <extensions>
        A comma-delimited list of file extensions to watch for changes.
        Default is 'node,js' (or when CoffeeScript, 'node,js,coffee,litcoffee').

      -n|--no-restart-on error|exit
        Don't automatically restart the supervised program if it ends.
        Superdaemon will wait for a change in the source files.
        If "error", an exit code of 0 will still restart.
        If "exit", no restart regardless of exit code.

      --force-watch
        Use fs.watch instead of fs.watchFile.
        This may be useful if you see a high cpu load on a windows machine.

      -h|--help|-?
        Display these usage instructions.

      -q|--quiet
        Suppress DEBUG messages

    Examples:
      superdaemon myapp.js
      superdaemon myapp.coffee
      superdaemon -w scripts -e myext -x myrunner myapp
      superdaemon -w lib,server.js,config.js server.js
      superdaemon -- server.js -h host -p port


## Simple Install

Just run:

    npm install superdaemon -g

## Fancy Install

Get this code, and then do this:

    npm link
