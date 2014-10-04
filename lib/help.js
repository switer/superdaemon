/*
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
        Specific file extensions to watch in addition to defaults.
        Used when --watch option includes folders
        Default is 'node,js'

    -n|--no-restart-on error|exit
        Don't automatically restart the supervised program if it ends.
        Superdaemon will wait for a change in the source files.
        If \"error\", an exit code of 0 will still restart.
        If \"exit\", no restart regardless of exit code.

    --force-watch
        Use fs.watch instead of fs.watchFile.
        This may be useful if you see a high cpu load on a windows machine.

    -h|--help|-?
        Display these usage instructions.

    -q|--quiet
        Suppress DEBUG messages

    -V|--verbose
        Show extra DEBUG messages

Examples:
    superdaemon "node ."
    superdaemon "node app.js"
    superdaemon -w scripts -e js "node npm start"
    superdaemon -- npm run test
    superdaemon -- npm install ++ npm run test
;
*/
var fs = require('fs');
module.exports = fs.readFileSync(__filename, 'utf-8').match(/\/\*([\s\S]+?)\*\//)[1];