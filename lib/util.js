'use strict';

module.exports = {
    removeQuotes: function (str) {
        return str.replace(/^'/, '').replace(/'$/, '');
    }
}