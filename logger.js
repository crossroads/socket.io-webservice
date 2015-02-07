var winston = require("winston");
var config = require("./config.js");
var logger = winston.loggers.add("socketio", config.winston);
logger.exitOnError = false;

module.exports = function(level, data) {
  var message = "";
  data.time = new Date();
  for (var property in data) {
    message += (message === "" ? "" : ", ") + property + "=" + JSON.stringify(data[property]);
  }
  logger[level](message);
};
