# SocketIO Web Service

The SocketIO Web Service allows multiple sites, differentiated via socket.io namespace, to send push messages to connected clients using socket.io.

When a client connects a request is made to your website to authenticate the user via the Authorization header, and to retrieve the list of rooms the client belongs to which can be a group name or individual name for direct communication. Your website can then send messages via this webservice to the clients, while the clients can communitate with your website directly.

## Sending Messages

The intention is client apps communicate directly with the server app, and the server app uses the following POST request on this app to communicate with the client app.

POST `http://socketio-webservice.com/send?site=newsite&apiKey=54321&resync=false`

Supports `Content-Type` `application/json` and `application/x-www-form-urlencoded`. Example:

```json
{
  "rooms": ["user_1", "staff"],
  "event": "update_store",
  "args": ["user", {"id":1,"age":5}]
}
```

* resync - performs a check when client indicates message is received to ensure it's first in queue if not will clear queue and send message to client to resync all data (default false)

## Handling unreliable connections

To handle unreliable connections socket.io web service uses a redis cache to store messages and waits for the client to invoke the callback function before removing the message from redis. This is only enabled for rooms that represent a single user, which is determined by room names starting with the site's `userRoomPrefix` setting (see add new site section). For rooms that represent multiple users the callback function will be `undefined` in the client.

```js
// client app
socket.on("update_store", function(entityType, entity, successCallback) {
  successCallback();
});
```

Upon reconnection all the messages for the connecting user will be sent to the client at once as the `batch` event with just a single successCallback for the batch event:

```js
// client app
socket.on("batch", batch);
socket.on("update_store", update_store);

function batch(events, successCallback) {
  events.forEach(function(args) {
    var event = args[0]; // e.g. update_store
    var eventArgs = args.slice(1);
    window[event].apply(this, eventArgs);
  });
  successCallback();
}

function update_store(entityType, entity, successCallback) {
  ...
  if (successCallback) {
    successCallback();
  }
}
```

For scenarios where socket.io is used to keep a local database in sync with a server database. There is an option you can turn on called `resync` when sending a message to the client (see send messages section). On success callback a check is made on the server to ensure the message being removed is the first one in the queue for that user and event. If not, say due to a client error processing previous message so that success callback was never called, all the queued messages for that user is cleared and a `resync` event will be sent to the client allowing a full resync to be performed:

```js
// client app
socket.on("resync", function() {
  window.location = window.location.href; // assumes client app performs full sync on page load
});
```

## Config

Configuration details are stored in `config/config.yml` and before the app starts `NODE_ENV` can be set to either `development` or `production`. If no environment is specified it defaults to production.

```yml
production:
  port: 80
  client_ttl: 3600
  redis:
    port: 6379
    host: 127.0.0.1
    auth_pass: 12345
  flakeid:
    datacenter: 0
    worker: 0
  io:
    pingTimeout: 60000
```

* port - the port the socket.io webservice will be available at (default 1337)
* client_ttl - the time messages will continue to be kept once the client becomes offline, set to 0 for messages to be kept indefinitely (default 3600 sec)
* redis
  * host - the hostname of the redis service to use (default 127.0.0.1)
  * port - the port number of the redis service to use (default 6379)
  * a full list of options can be found here https://github.com/mranney/node_redis#rediscreateclient
* flakeid
  * a full list of options can be found here https://github.com/T-PWK/flake-idgen#usage
* io
  * a full list of options can be found here https://github.com/Automattic/socket.io#serveroptsobject

### Add New Site
To add new sites modify `config/sites.yml` as follows:

```yml
newsite:
  authUrl: http://newsite.com/socketrooms
  authScheme: Bearer
  apiKey: 54321
  userRoomPrefix: user_
```

* name - is the namespace for socketio, the client connects as `io("/newsite")`
* authUrl - this is the url the socketio webservice will use to retrieve the rooms the authenticated user belongs to, the client is required to provide the token `io("/newsite?token=12345")` on connection and will form part of the Authorization header that will be used when the request is made to authUrl
* authScheme - is used as part of the Authorization header that will be sent to the authUrl
* apiKey - used to authenticate requests when sending messages to clients via this webservice
* userRoomPrefix - the prefix rooms belonging to a single user starts with, used for determining whether to enable handling connection reliability functionality

## Development

### Installation

* Install nodejs - https://github.com/creationix/nvm
* `git clone` this repository
* `npm install`

### Running

* `npm start`
* Visit your app at http://localhost:1337.

### Debugging

* `npm run debug`
* Add a break point at start of app and hit continue in the debugger
* Visit your app at e.g. http://localhost:1337 in a different tab
* Now you can add a break point where you want to debug

## Production

### Installing Nginx / Passenger

Assumes you've installed rvm already

```shell
yum install nodejs npm
gem install passenger
rvmsudo passenger-install-nginx-module --languages nodejs --auto
```

### Shipit Deployment

Uses the [Shipit framework](https://github.com/shipitjs/grunt-shipit) (it's like Capistrano is for Ruby).

Copy `config/Gruntfile.js.example` to `config/Gruntfile.js` and change the `deploy@example.net` line to your production server (uses ssh).

    cp Gruntfile.js.example Gruntfile.js
    grunt shipit:production deploy
    grunt shipit:production rollback

The deploy script automatically handles `npm install` on the remote machine and ensures shared files are symlinked to the current folder.

## Known Issues

* Nodejs has trouble connecting to local websites via localhost during authentication, the workaround is to start rails (or some other web app) bound to 127.0.0.1 instead (the socket.io authUrl can still say localhost) .e.g

  `rails s --binding=127.0.0.1`

* The app hangs if you set logging mode to `DEBUG=*` when debugging the app
* Debugger does not work in node versions 0.10.34 and 0.10.35
