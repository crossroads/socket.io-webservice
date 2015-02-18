// load site and configuration data
var fs = require("fs");
var yaml = require("js-yaml");
var extend = require("util")._extend;
var env = process.env.NODE_ENV || "production";
var config = yaml.safeLoad(fs.readFileSync("./config.yml", "utf8"))[env];
config.sites = yaml.safeLoad(fs.readFileSync("./sites.yml", "utf8"));
config.env = env;

if (!config.device_ttl) { config.device_ttl = 3600; }
config.redis = extend({port:6379, host:"127.0.0.1"}, config.redis);
config.winston = config.winston || {"console":{"colorize":true}};

module.exports = config;
