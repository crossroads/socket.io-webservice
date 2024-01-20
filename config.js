// load site and configuration data
var fs = require("fs");
var yaml = require("js-yaml");
var extend = require("util")._extend;
var env = process.env.NODE_ENV || "production";
var config = {};
var sites = {};

if (fs.existsSync("./config.yml")) {
  config = yaml.load(fs.readFileSync("./config.yml", "utf8"))[env];
}
if (fs.existsSync("./sites.yml")) {
  config.sites = yaml.load(fs.readFileSync("./sites.yml", "utf8"));
}

config.env = env;

config.cors = {
  origin: /(localhost:\d+|goodcity\.hk)$/,
  optionsSuccessStatus: 200
}

config.io = config.io || {}
config.io.cors = config.cors;

// environment defaults suitable for docker
if (!config.device_ttl) { config.device_ttl = process.env.DEVICE_TTL || 3600; }
if (!config.redis) { config.redis = {url: process.env.REDIS_URL}; }
config.redis = extend({port:6379, host:"127.0.0.1"}, config.redis);

// default to STDOUT
config.winston = config.winston || {"console":{"colorize":false}};

// import single site from ENV, useful in docker env
if (process.env.SITE_NAME) {
  sites = {};
  sites[process.env.SITE_NAME] = {
    authUrl: process.env.AUTH_URL,
    authScheme: process.env.AUTH_SCHEME,
    apiKey: process.env.API_KEY,
    userRoomPrefix: process.env.USER_ROOM_PREFIX,
    updateUserUrl: process.env.UPDATE_USER_URL,
    publicChannel: process.env.PUBLIC_CHANNEL
  };
  config.sites = sites;
}

module.exports = config;
