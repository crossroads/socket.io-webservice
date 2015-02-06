require("newrelic");
var express = require("express");
var app = express();
var server = require("http").createServer(app);
var config = require("./config.js");
var io = require("socket.io")(server, config.io);
var store = require("./store.js")(config.redis, config.flakeid);

// error handling
var errorHandler;
if (config.airbrake && config.airbrake.key) {
  var airbrake = require("airbrake").createClient(config.airbrake.key, config.env);
  for (var setting in config.airbrake) {
    airbrake[setting] = config.airbrake[setting];
  }
  // this registers uncaughtException for node errors and then returns error handler
  errorHandler = airbrake.expressHandler();
}

// utilities
var url = require("url");
var httpClient = require("request");
var debug = require("debug")("app");

// setup express to parse various content-type
var bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// configure socket.io redis
var redis = require("redis");
var redisAdapter = require("socket.io-redis");
config.redis.return_buffers = true;
var pub = redis.createClient(config.redis.port, config.redis.host, config.redis);
var sub = redis.createClient(config.redis.port, config.redis.host, config.redis);
io.adapter(redisAdapter({pubClient: pub, subClient: sub}));

// start app
var port = process.env.PORT || config.port || 1337;
debug("Listening on " + port);
server.listen(port);

// send message to client
app.post("/send", function (req, res) {
  debug("Send message request, rooms:" + JSON.stringify(req.body.rooms) + ", event: " + req.body.event + ", args: " + JSON.stringify(req.body.args));

  if (!req.query.site || !req.query.apiKey) {
    return res.status(400).send("Missing query param 'site' or 'apiKey'.");
  }
  var site = config.sites[req.query.site];
  if (!site || site.apiKey !== req.query.apiKey) {
    return res.sendStatus(401);
  }

  var nsp = io.of("/" + req.query.site);
  if (!site.userRoomEnabled) {
    nsp.to(room).emit.apply(nsp, args);
    return;
  }

  // turn shared rooms into array of private rooms for connected users
  var rooms = [];
  [].concat(req.body.rooms).forEach(function(room) {
    if (nsp.isUserRoom(room)) {
      rooms.push(room);
    } else {
      rooms = rooms.concat(nsp.getUserRooms(room));
    }
  });
  // only unique
  rooms = rooms.filter(function(value, index, self) { return self.indexOf(value) === index; });

  rooms.forEach(function(room) {
    // user not connected or TTL expired and requires a full sync so no need to store message
    if (config.client_ttl !== 0 && (nsp.users[room] === undefined ||
      nsp.users[room] !== true && (Date.now() - nsp.users[room]) > config.client_ttl * 1000)) {
      delete nsp.users[room];
      debug("User " + room + "not connected");
      return;
    }

    var args = [req.body.event].concat(req.body.args);
    var dataId = store.add(nsp.name, room, req.body.event, args);
    debug("Message: " + dataId + ", room:" + room + ", args: " + JSON.stringify(args));

    var socket = nsp.getUserSocket(room);
    if (socket) {
      var callback = function() {
        debug("Remove message: " + dataId);
        store.remove(nsp.name, room, req.body.event, dataId, !req.query.resync ? null : function() {
          socket.emit("_resync");
          debug("Resync emitted from message: " + dataId);
          store.clear(nsp.name, room, req.body.event);
        });
      };
      socket.emit.apply(socket, args.concat(callback));
    }
  });
  return res.sendStatus(200);
});

for (var siteName in config.sites) {
  var site = config.sites[siteName];
  var nsp = io.of("/" + siteName);
  nsp.users = {};
  site.userRoomEnabled = site.userRoomPrefix && site.userRoomPrefix !== "";

  // helper functions
  nsp.isUserRoom = function(room) {
    return room.indexOf(site.userRoomPrefix) === 0;
  };

  nsp.getUserSocket = function(userRoom) {
    if (!nsp.adapter.rooms[userRoom]) { return null; }
    var socketId = Object.keys(nsp.adapter.rooms[userRoom])[0];
    return nsp.sockets.filter(function(s) { return s.id === socketId; })[0];
  };

  nsp.getUserRooms = function(sharedRoom) {
    if (!nsp.adapter.rooms[sharedRoom]) { return []; }
    var socketIds = Object.keys(nsp.adapter.rooms[sharedRoom]);
    return nsp.sockets
      .filter(function(s) { return socketIds.some(function(id) { return s.id == id}); })
      .map(function(s) { return s.rooms.filter(function(r) { return nsp.isUserRoom(r); })[0]; });
  };

  // socket.io authentication and room registration
  nsp.use(function(socket, next) {
    var query = url.parse(socket.request.url, true).query;
    var headers = {"Authorization": site.authScheme + " " + query.token};

    httpClient.get(site.authUrl, {headers:headers, json:true}, function(error, res, data) {
      if (error) {
        return next(new Error("Auth error: " + error));
      } else if (res.statusCode === 401) {
        return next(new Error("Authentication error"));
      } else if (res.statusCode !== 200) {
        return next(new Error("Auth " + res.statusCode + " error"));
      } else if (site.userRoomEnabled && !data.some(function(r) { return nsp.isUserRoom(r); })) {
        return next(new Error("User is missing a private room"));
      }
      debug("Assigned rooms: " + data);
      socket.rooms.forEach(function(room) { socket.leave(room); });
      data.forEach(function(room) { socket.join(room); });
      next();
    });
  });

  // send missed messages
  nsp.on("connection", function(socket) {
    debug("connection: " + JSON.stringify(socket.rooms));
    socket.emit("_settings", {"client_ttl":config.client_ttl});
    socket.rooms.filter(nsp.isUserRoom).forEach(function(room) {
      store.get(nsp.name, room, function(batchArgs) {
        var callback = function() { store.clear(nsp.name, room); };
        socket.emit.apply(socket, ["_batch", batchArgs, callback]);
      });

      if (config.client_ttl > 0) {
        nsp.users[room] = true;
        store.persist(nsp.name, room);

        socket.on("disconnect", function() {
          nsp.users[room] = Date.now();
          store.expire(nsp.name, room, config.client_ttl);
        });
      }
    });
  });
}

// this needs to came after other app.use that you want to record errors for
if (errorHandler) {
  app.use(errorHandler);
}
