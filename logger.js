var winston = require("winston");
var config = require("./config.js");
var logger = winston.loggers.add("socketio", config.winston);
logger.exitOnError = false;

module.exports = logger;
