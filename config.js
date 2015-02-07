// load site and configuration data
var fs = require("fs");
var yaml = require("js-yaml");
var env = process.env.NODE_ENV || "production";
var config = yaml.safeLoad(fs.readFileSync("./config.yml", "utf8"))[env];
config.sites = yaml.safeLoad(fs.readFileSync("./sites.yml", "utf8"));
config.env = env;

if (!config.redis) { config.redis = {}; }
if (!config.redis.port) { config.redis.port = 6379; }
if (!config.redis.host) { config.redis.host = "127.0.0.1"; }
if (!config.device_ttl) { config.device_ttl = 3600; }

module.exports = config;
