require('newrelic');
var app = require("express")();
var http = require("http");
var url = require("url");
var yaml = require("js-yaml");
var fs = require("fs");
var redis = require("redis");
var bodyParser = require("body-parser");
var redisAdapter = require("socket.io-redis");
var httpClient = require("request");
var debug = require("debug")("app");
var server = http.Server(app);
var io = require("socket.io")(server);
var config = yaml.safeLoad(fs.readFileSync("./config.yml", "utf8"))[process.env.NODE_ENV || "production"];
var sites = yaml.safeLoad(fs.readFileSync("./sites.yml", "utf8"));

// configure socket.io redis
if (config.redisPort && config.redisHost) {
  var opts = {auth_pass: config.redisKey, return_buffers: true};
  var pub = redis.createClient(config.redisPort, config.redisHost, opts);
  var sub = redis.createClient(config.redisPort, config.redisHost, opts);
  io.adapter(redisAdapter({pubClient: pub, subClient: sub}));
}

var port = process.env.PORT || config.port;
debug("Listening on " + port);
server.listen(port);

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.post("/send", function (req, res) {
  if (!req.query.site || !req.query.apiKey) {
    return res.status(400).send("Missing query param 'site' or 'apiKey'.");
  }
  var site = sites[req.query.site];
  if (!site || site.apiKey !== req.query.apiKey) {
    return res.sendStatus(401);
  }
  var nsp = io.of("/" + req.query.site);
  [].concat(req.body.rooms).forEach(function(room) {
    debug("Event: " + req.body.event + ", Room:" + room + ", Args: " + JSON.stringify(req.body.args));
    nsp.to(room).emit.apply(nsp, [req.body.event].concat(req.body.args));
  });
  return res.sendStatus(200);
});

// socket.io authentication and room registration
for (var siteName in sites) {
  var site = sites[siteName];

  io.of("/" + siteName).use(function(socket, next) {

    var query = url.parse(socket.request.url, true).query;
    var headers = {"Authorization": site.authScheme + " " + query.token};

    httpClient.get(site.authUrl, {headers:headers, json:true}, function(error, res, data) {
      if (error) {
        return next(new Error("Auth error: " + error));
      } else if (res.statusCode == 401) {
        return next(new Error("Authentication error"));
      } else if (res.statusCode != 200) {
        return next(new Error("Auth " + res.statusCode + " error"));
      }
      debug("Assigned rooms: " + data);
      data.forEach(function(room) { socket.join(room); });
      next();
    });

  });
}
