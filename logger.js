var util = require("util");
var winston = require("winston");
var config = require("./config.js");
var options = config.winston;

// add our custom formatter for file logs
if (options.file) {
  options.file['formatter'] = function(options) {
    return 'time="' + (new Date().toISOString()) +'" level="'+ options.level.toUpperCase() +'" message="'+ (undefined !== options.message ? options.message : '') + '" meta="' +
      (options.meta && Object.keys(options.meta).length ? JSON.stringify(options.meta) : '' ) + '"';
  }
}

var logger = winston.loggers.add("socketio", options);
logger.exitOnError = false;
module.exports = logger;
