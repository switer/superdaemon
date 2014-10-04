var superdaemon = require('../lib/superdaemon.js');

superdaemon.run(['--', '2000 grunt --version ++ npm --list'])