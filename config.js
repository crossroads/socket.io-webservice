// load site and configuration data
var fs = require("fs");
var yaml = require("js-yaml");
var config = yaml.safeLoad(fs.readFileSync("./config.yml", "utf8"))[process.env.NODE_ENV || "production"];
config.sites = yaml.safeLoad(fs.readFileSync("./sites.yml", "utf8"));

if (!config.redis) { config.redis = {}; }
if (!config.redis.port) { config.redis.port = 6379; }
if (!config.redis.host) { config.redis.host = "127.0.0.1"; }

module.exports = config;
