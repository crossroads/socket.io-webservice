var winston = require("winston");

const logger = winston.createLogger({
  exitOnError: false,
  level: "info",
  transports: [
    new winston.transports.Console({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    })
  ]
});

module.exports = logger;
