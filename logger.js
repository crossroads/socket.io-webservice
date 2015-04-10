var util = require("util");
var winston = require("winston");
var config = require("./config.js");
var options = config.winston;

// add our custom formatter for file logs
if (options.file) {
  options.file['formatter'] = function(options) {
    var text = 'time="' + (new Date().toISOString()) +'" level="'+ options.level.toUpperCase() +'" message="'+ (undefined !== options.message ? options.message : '') + '"';

    if (options.meta) {
      if (typeof options.meta === 'object') {
        for (key in options.meta) {
          var str = options.meta[key];
          if (typeof str === 'object') {
            str = JSON.stringify(str);
          }
          str = str.toString().replace(/"/g, "'");
          text += ' ' + key + '="' + str + '"';
        }
      } else {
        text += ' meta="' + options.meta.replace(/"/g, "'") + '"';
      }
    }
    return text;
  }
}

var logger = winston.loggers.add("socketio", options);
logger.exitOnError = false;
module.exports = logger;
